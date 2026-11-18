// Approval guard (task 5.5). Reads only the command text and can only deny.
// The reserved names belong to the human; an agent must never run them.

const RESERVED = ['ghost-run approve', 'ghost-run-approve'];

/** @param {unknown} commandText */
export function isApprovalCommand(commandText) {
  if (typeof commandText !== 'string') return false;
  const text = commandText.toLowerCase().replace(/["'`]/g, '');
  return RESERVED.some((name) => text.includes(name));
}
