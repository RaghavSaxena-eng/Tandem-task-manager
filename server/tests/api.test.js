process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const request = require('supertest');
const { io: connect } = require('socket.io-client');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../src/app');
const { setupSocket } = require('../src/socket');

let mongod;
let server;
let baseUrl;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  server = http.createServer(app);
  setupSocket(server, app);
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  app.get('io')?.close();
  await mongoose.disconnect();
  await mongod.stop();
});

const api = () => request(app);
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function register(name) {
  const res = await api()
    .post('/api/auth/register')
    .send({ name, email: `${name.toLowerCase()}@example.com`, password: 'password123' });
  assert.equal(res.status, 201);
  return { token: res.body.token, id: res.body.user._id, email: res.body.user.email };
}

test('auth: register, login, me, and bad credentials', async () => {
  const u = await register('Alice');
  const login = await api().post('/api/auth/login').send({ email: u.email, password: 'password123' });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
  assert.equal(login.body.user.passwordHash, undefined);

  const me = await api().get('/api/auth/me').set(auth(u.token));
  assert.equal(me.body.user.email, u.email);

  const bad = await api().post('/api/auth/login').send({ email: u.email, password: 'wrong-password' });
  assert.equal(bad.status, 401);

  const dup = await api().post('/api/auth/register').send({ name: 'x', email: u.email, password: 'password123' });
  assert.equal(dup.status, 409);

  assert.equal((await api().get('/api/workspaces')).status, 401);
});

test('RBAC: owner vs member vs outsider across workspace, board and task', async () => {
  const owner = await register('Olivia');
  const member = await register('Max');
  const outsider = await register('Eve');

  // Owner creates workspace, adds member
  const ws = (await api().post('/api/workspaces').set(auth(owner.token)).send({ name: 'Acme' })).body.workspace;
  assert.equal(ws.myRole, 'owner');
  const added = await api()
    .post(`/api/workspaces/${ws._id}/members`)
    .set(auth(owner.token))
    .send({ email: member.email });
  assert.equal(added.status, 201);

  // Outsider can't even see it (404), member can
  assert.equal((await api().get(`/api/workspaces/${ws._id}`).set(auth(outsider.token))).status, 404);
  assert.equal((await api().get(`/api/workspaces/${ws._id}`).set(auth(member.token))).status, 200);

  // Only owners manage boards and members
  const memberBoard = await api().post(`/api/workspaces/${ws._id}/boards`).set(auth(member.token)).send({ name: 'Nope' });
  assert.equal(memberBoard.status, 403);
  const board = (await api().post(`/api/workspaces/${ws._id}/boards`).set(auth(owner.token)).send({ name: 'Sprint 1' })).body.board;
  assert.ok(board._id);
  const memberAdds = await api().post(`/api/workspaces/${ws._id}/members`).set(auth(member.token)).send({ email: outsider.email });
  assert.equal(memberAdds.status, 403);

  // Outsider can't read or create tasks
  assert.equal((await api().get(`/api/boards/${board._id}/tasks`).set(auth(outsider.token))).status, 404);
  assert.equal((await api().post(`/api/boards/${board._id}/tasks`).set(auth(outsider.token)).send({ title: 'x' })).status, 404);

  // Member creates a task; owner creates another
  const mine = (await api().post(`/api/boards/${board._id}/tasks`).set(auth(member.token)).send({ title: 'Member task' })).body.task;
  const theirs = (await api().post(`/api/boards/${board._id}/tasks`).set(auth(owner.token)).send({ title: 'Owner task', priority: 'high' })).body.task;
  assert.equal(mine.status, 'todo');
  assert.equal(theirs.priority, 'high');

  // Member can edit own task but not someone else's
  const moveMine = await api().patch(`/api/tasks/${mine._id}`).set(auth(member.token)).send({ status: 'in_progress' });
  assert.equal(moveMine.status, 200);
  assert.equal(moveMine.body.task.status, 'in_progress');
  assert.equal((await api().patch(`/api/tasks/${theirs._id}`).set(auth(member.token)).send({ status: 'done' })).status, 403);

  // ...unless it's assigned to them (owner assigns it)
  const assign = await api().patch(`/api/tasks/${theirs._id}`).set(auth(owner.token)).send({ assignee: member.id });
  assert.equal(assign.status, 200);
  assert.equal(assign.body.task.assignee.email, member.email);
  assert.equal((await api().patch(`/api/tasks/${theirs._id}`).set(auth(member.token)).send({ status: 'done' })).status, 200);

  // Assignee must belong to the workspace
  const badAssign = await api().patch(`/api/tasks/${mine._id}`).set(auth(owner.token)).send({ assignee: outsider.id });
  assert.equal(badAssign.status, 400);

  // Invalid input is rejected
  assert.equal((await api().patch(`/api/tasks/${mine._id}`).set(auth(owner.token)).send({ status: 'bogus' })).status, 400);

  // Delete rules: member can't delete the owner's task, owner can delete anything
  assert.equal((await api().delete(`/api/tasks/${theirs._id}`).set(auth(member.token))).status, 403);
  assert.equal((await api().delete(`/api/tasks/${mine._id}`).set(auth(owner.token))).status, 204);

  // Only owners delete boards / workspaces
  assert.equal((await api().delete(`/api/boards/${board._id}`).set(auth(member.token))).status, 403);
  assert.equal((await api().delete(`/api/workspaces/${ws._id}`).set(auth(member.token))).status, 403);
});

test('members: last-owner guard, promote, leave and unassign', async () => {
  const owner = await register('Nora');
  const member = await register('Mike');
  const ws = (await api().post('/api/workspaces').set(auth(owner.token)).send({ name: 'Team' })).body.workspace;
  await api().post(`/api/workspaces/${ws._id}/members`).set(auth(owner.token)).send({ email: member.email });
  const board = (await api().post(`/api/workspaces/${ws._id}/boards`).set(auth(owner.token)).send({ name: 'B' })).body.board;
  const task = (await api().post(`/api/boards/${board._id}/tasks`).set(auth(owner.token)).send({ title: 'T', assignee: member.id })).body.task;

  // Can't demote or remove the only owner
  assert.equal((await api().patch(`/api/workspaces/${ws._id}/members/${owner.id}`).set(auth(owner.token)).send({ role: 'member' })).status, 400);
  assert.equal((await api().delete(`/api/workspaces/${ws._id}/members/${owner.id}`).set(auth(owner.token))).status, 400);

  // Member can't remove others, but can leave; their assignments are cleared
  assert.equal((await api().delete(`/api/workspaces/${ws._id}/members/${owner.id}`).set(auth(member.token))).status, 403);
  assert.equal((await api().delete(`/api/workspaces/${ws._id}/members/${member.id}`).set(auth(member.token))).status, 204);
  const tasks = (await api().get(`/api/boards/${board._id}/tasks`).set(auth(owner.token))).body.tasks;
  assert.equal(tasks.find((t) => t._id === task._id).assignee, null);
  assert.equal((await api().get(`/api/workspaces/${ws._id}`).set(auth(member.token))).status, 404);

  // Promote a new owner, then the original owner may leave
  await api().post(`/api/workspaces/${ws._id}/members`).set(auth(owner.token)).send({ email: member.email });
  const promoted = await api().patch(`/api/workspaces/${ws._id}/members/${member.id}`).set(auth(owner.token)).send({ role: 'owner' });
  assert.equal(promoted.status, 200);
  assert.equal((await api().delete(`/api/workspaces/${ws._id}/members/${owner.id}`).set(auth(owner.token))).status, 204);
});

test('socket.io: members receive live task events, outsiders cannot join', async () => {
  const owner = await register('Sam');
  const outsider = await register('Oscar');
  const ws = (await api().post('/api/workspaces').set(auth(owner.token)).send({ name: 'Live' })).body.workspace;
  const board = (await api().post(`/api/workspaces/${ws._id}/boards`).set(auth(owner.token)).send({ name: 'B' })).body.board;

  // Unauthenticated sockets are rejected
  const anon = connect(baseUrl, { auth: { token: 'nope' }, reconnection: false });
  await new Promise((resolve) => anon.on('connect_error', resolve));
  anon.close();

  const mine = connect(baseUrl, { auth: { token: owner.token }, reconnection: false });
  const theirs = connect(baseUrl, { auth: { token: outsider.token }, reconnection: false });
  await Promise.all([
    new Promise((r) => mine.on('connect', r)),
    new Promise((r) => theirs.on('connect', r)),
  ]);

  const joined = await new Promise((r) => mine.emit('workspace:join', ws._id, r));
  assert.equal(joined.ok, true);
  const denied = await new Promise((r) => theirs.emit('workspace:join', ws._id, r));
  assert.equal(denied.ok, false);

  let leaked = false;
  theirs.on('task:created', () => { leaked = true; });
  const received = new Promise((resolve) => mine.on('task:created', resolve));

  await api().post(`/api/boards/${board._id}/tasks`).set(auth(owner.token)).send({ title: 'Realtime!' });
  const event = await received;
  assert.equal(event.task.title, 'Realtime!');

  await new Promise((r) => setTimeout(r, 100));
  assert.equal(leaked, false);
  mine.close();
  theirs.close();
});
