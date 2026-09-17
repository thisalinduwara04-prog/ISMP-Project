const Notification = require('../../models/Notification');
const AppError = require('../../utils/AppError');
const AppErrorCode = require('../../constants/appErrorCode');
const { OK, NOT_FOUND } = require('../../constants/http');

const success = (req, res, data) => res.status(OK).json({ success: true, data, requestId: req.id });

const list = async (req, res) => {
  const items = await Notification.find({ userId: req.user._id })
    .sort({ isRead: 1, createdAt: -1 })
    .limit(100)
    .lean();
  return success(req, res, { items, unread: items.filter((item) => !item.isRead).length });
};

const read = async (req, res) => {
  const item = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  ).lean();
  if (!item) throw new AppError(NOT_FOUND, 'Notification not found.', AppErrorCode.NOT_FOUND);
  return success(req, res, item);
};

const readAll = async (req, res) => {
  const result = await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return success(req, res, { updated: result.modifiedCount });
};

module.exports = { list, read, readAll };
