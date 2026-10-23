/**
 * Creates a demo workspace so visitors (e.g. recruiters) can explore the app
 * without signing up. Safe to run repeatedly: it replaces the previous demo data.
 *
 *   npm run seed
 *
 * Demo logins (password: demo1234)
 *   demo@tandem.dev  - owner of the workspace
 *   priya@tandem.dev - member
 *   alex@tandem.dev  - member
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const User = require('../src/models/User');
const Workspace = require('../src/models/Workspace');
const Board = require('../src/models/Board');
const Task = require('../src/models/Task');

const PASSWORD = 'demo1234';
const days = (n) => new Date(Date.now() + n * 86400000);

async function main() {
  await mongoose.connect(config.mongoUri);

  const emails = ['demo@tandem.dev', 'priya@tandem.dev', 'alex@tandem.dev'];
  const old = await User.find({ email: { $in: emails } });
  const oldWorkspaces = await Workspace.find({ createdBy: { $in: old.map((u) => u._id) } });
  const wsIds = oldWorkspaces.map((w) => w._id);
  await Task.deleteMany({ workspace: { $in: wsIds } });
  await Board.deleteMany({ workspace: { $in: wsIds } });
  await Workspace.deleteMany({ _id: { $in: wsIds } });
  await User.deleteMany({ email: { $in: emails } });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const [demo, priya, alex] = await User.insertMany([
    { name: 'Demo Owner', email: emails[0], passwordHash },
    { name: 'Priya Nair', email: emails[1], passwordHash },
    { name: 'Alex Morgan', email: emails[2], passwordHash },
  ]);

  const ws = await Workspace.create({
    name: 'Product Launch',
    description: 'Everything for the v2 release.',
    createdBy: demo._id,
    members: [
      { user: demo._id, role: 'owner' },
      { user: priya._id, role: 'member' },
      { user: alex._id, role: 'member' },
    ],
  });

  const [sprint, marketing] = await Board.insertMany([
    { workspace: ws._id, name: 'Sprint 12', createdBy: demo._id },
    { workspace: ws._id, name: 'Marketing', createdBy: demo._id },
  ]);

  const t = (board, title, extra) => ({ board: board._id, workspace: ws._id, title, createdBy: demo._id, ...extra });
  await Task.insertMany([
    t(sprint, 'Write release notes for v2', { status: 'todo', priority: 'high', assignee: priya._id, dueDate: days(2), createdBy: priya._id }),
    t(sprint, 'Review onboarding copy', { status: 'todo', priority: 'low', assignee: alex._id, createdBy: alex._id }),
    t(sprint, 'Fix invite email formatting', { status: 'in_progress', priority: 'medium', assignee: alex._id, dueDate: days(1), createdBy: alex._id }),
    t(sprint, 'Add dark mode to settings', { status: 'in_progress', priority: 'medium', assignee: priya._id, createdBy: priya._id }),
    t(sprint, 'Rotate production API keys', { status: 'todo', priority: 'high', assignee: demo._id, dueDate: days(-1) }),
    t(sprint, 'Set up CI pipeline', { status: 'done', priority: 'medium', assignee: demo._id }),
    t(sprint, 'Migrate user table indexes', { status: 'done', priority: 'low', assignee: alex._id, createdBy: alex._id }),
    t(marketing, 'Draft launch announcement', { status: 'in_progress', priority: 'high', assignee: priya._id, dueDate: days(3), createdBy: priya._id }),
    t(marketing, 'Book demo webinar', { status: 'todo', priority: 'medium' }),
    t(marketing, 'Update pricing page screenshots', { status: 'done', priority: 'low', assignee: alex._id, createdBy: alex._id }),
  ]);

  console.log('Seeded demo workspace. Sign in as demo@tandem.dev / demo1234');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
