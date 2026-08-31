const cron = require('node-cron');
const env = require('../../config/env');
const { runNightlySweep } = require('./reminder.service');

let task = null;

const startReminderScheduler = () => {
  if (env.isTest || task) return task;
  task = cron.schedule(
    env.REMINDER_CRON,
    () => runNightlySweep().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[compliance] Reminder sweep failed:', error.message);
    }),
    { timezone: env.REMINDER_TIMEZONE }
  );
  return task;
};

const stopReminderScheduler = () => {
  if (task) task.stop();
  task = null;
};

module.exports = { startReminderScheduler, stopReminderScheduler };
