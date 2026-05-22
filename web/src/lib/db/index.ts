/**
 * Public D1 API barrel.
 *
 * All callsites outside `lib/db/` should import from `../lib/db` (this file).
 * Internal modules import from siblings (`./core`, `./boards`, etc.).
 *
 * Grouping:
 * - core       : ensureMigrated + rid + the MIGRATIONS array (schema)
 * - workspaces : workspace CRUD, leave/transfer/rename
 * - members    : list / role / remove
 * - invites    : create / list / revoke / redeem
 * - boards     : CRUD + cascade delete + touchBoard
 * - board-full : getBoardFull (the one-shot multi-join read)
 * - lists      : CRUD
 * - cards      : CRUD + move + assignees + labels + checklist
 * - comments   : list / add / soft-delete + parseMentions
 * - mentions   : inbox (list / count / mark-read)
 * - activity   : log + list per board
 * - features   : CRUD
 * - my-tasks   : cross-board assigned-to-me view
 */

export { ensureMigrated } from './core'

export {
  listMyWorkspaces,
  createWorkspace,
  renameWorkspace,
  leaveWorkspace,
  transferOwnership,
} from './workspaces'

export { listMembers, updateMemberRole, removeMember, updateMyDisplayName } from './members'

export { createInvite, listInvites, revokeInvite, redeemInvite } from './invites'

export {
  listBoards,
  createBoard,
  setBoardFeature,
  renameBoard,
  deleteBoard,
} from './boards'

export { getBoardFull } from './board-full'

export { createList, renameList, deleteList, getStatusListId } from './lists'

export {
  createCard,
  updateCard,
  deleteCard,
  archiveCard,
  unarchiveCard,
  listArchivedCards,
  moveCard,
  addAssignee,
  removeAssignee,
  ensureBoardLabels,
  renameBoardLabel,
  setCardLabels,
  setChecklist,
} from './cards'
export type { CardPatch, ArchivedCardSummary } from './cards'

export {
  listComments,
  listCommentCountsByCard,
  addComment,
  deleteComment,
  parseMentions,
} from './comments'

export {
  listMyMentions,
  countUnreadMentions,
  markMentionRead,
  markAllMentionsRead,
} from './mentions'

export { logActivity, listBoardActivity } from './activity'

export {
  listFeatures,
  createFeature,
  renameFeature,
  deleteFeature,
} from './features'

export { listMyTasks } from './my-tasks'
