const { STATUSES, PRIORITIES } = require('../models/Task');
const { HttpError } = require('./httpError');

const populateTask = (query) =>
  query.populate('assignee', 'name email').populate('createdBy', 'name email');

/**
 * Validate and normalise task input from a request body. Only fields that are
 * present are returned, so it works for both create and partial update.
 */
function parseTaskInput(body = {}, workspace, { requireTitle = false } = {}) {
  const out = {};

  if (body.title !== undefined || requireTitle) {
    if (!body.title || !String(body.title).trim()) throw new HttpError(400, 'Task title is required');
    out.title = String(body.title).trim();
  }
  if (body.description !== undefined) out.description = String(body.description);

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, `Status must be one of: ${STATUSES.join(', ')}`);
    out.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) {
      throw new HttpError(400, `Priority must be one of: ${PRIORITIES.join(', ')}`);
    }
    out.priority = body.priority;
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === '') out.dueDate = null;
    else {
      const d = new Date(body.dueDate);
      if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Invalid due date');
      out.dueDate = d;
    }
  }
  if (body.assignee !== undefined) {
    if (body.assignee === null || body.assignee === '') out.assignee = null;
    else {
      if (!workspace.getMember(body.assignee)) {
        throw new HttpError(400, 'Assignee must be a member of this workspace');
      }
      out.assignee = body.assignee;
    }
  }
  return out;
}

module.exports = { populateTask, parseTaskInput };
