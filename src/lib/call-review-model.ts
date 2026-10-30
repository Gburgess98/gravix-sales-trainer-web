// Day 46 — pure decision model for the call-review header actions.
// The page used to repeat Mark Reviewed / Assign Coaching / Assign Drill / Link CRM in
// the header and again in the summary, each as a competing button. This module decides,
// from state the page already holds, which single action is primary and which stay
// secondary. It holds no authorization logic: `isManager` is the page's existing
// `managerCheckDone && isManager`, passed in unchanged, and manager-only actions are
// never offered without it.

export type ReviewActionId =
  | 'mark-reviewed'
  | 'assign-coaching'
  | 'assign-drill'
  | 'practise'
  | 'link-crm'

export const MANAGER_ONLY_ACTIONS: readonly ReviewActionId[] = [
  'mark-reviewed',
  'assign-coaching',
  'assign-drill',
]

export interface ReviewActionInput {
  /** callMeta.status (scored / processing / failed / …); null while loading. */
  status: string | null | undefined
  /** The page's existing `managerCheckDone && isManager`. */
  isManager: boolean
  reviewed: boolean
  coachingAssigned: boolean
  /** Label of the weakest scored stage, if any. */
  practiseStage: string | null
}

export interface ReviewActionPlan {
  primary: ReviewActionId | null
  secondary: ReviewActionId[]
}

const ORDER: ReviewActionId[] = ['mark-reviewed', 'assign-coaching', 'assign-drill', 'practise', 'link-crm']

export function planReviewActions(input: ReviewActionInput): ReviewActionPlan {
  const scored = input.status === 'scored'
  const available = new Set<ReviewActionId>(['link-crm'])

  if (input.isManager) {
    // Assign Drill was always offered to managers, whatever the call status.
    available.add('assign-drill')
    if (scored && !input.reviewed) available.add('mark-reviewed')
    if (scored && !input.coachingAssigned) available.add('assign-coaching')
  } else if (scored && input.practiseStage) {
    available.add('practise')
  }

  // One primary at most: the first outstanding step of the role's main job
  // (manager: review, then coach; rep: practise the weakest stage). Not while
  // the call is still processing or failed.
  let primary: ReviewActionId | null = null
  if (scored) {
    primary = (['mark-reviewed', 'assign-coaching', 'practise'] as const).find((id) => available.has(id)) ?? null
  }

  return {
    primary,
    secondary: ORDER.filter((id) => available.has(id) && id !== primary),
  }
}
