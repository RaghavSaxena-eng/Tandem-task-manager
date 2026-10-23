const mongoose = require('mongoose');

const ROLES = ['owner', 'member'];

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ROLES, default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    members: { type: [memberSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

workspaceSchema.index({ 'members.user': 1 });

workspaceSchema.methods.getMember = function (userId) {
  return this.members.find((m) => String(m.user._id || m.user) === String(userId));
};

module.exports = mongoose.model('Workspace', workspaceSchema);
module.exports.ROLES = ROLES;
