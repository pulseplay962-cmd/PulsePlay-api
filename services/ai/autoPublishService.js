/**
 * Automatic AI publishing is intentionally disabled.
 *
 * PulsePlay's content workflow requires the owner to review and approve each
 * article in the admin UI before it can be published. Do not auto-promote
 * pending queue items to approved here: that bypasses the approval boundary.
 *
 * Keep this function as a no-op for compatibility with the existing scheduler
 * until the scheduler's publishing phase is removed in a separate cleanup.
 */
export async function autoPublishDueAIContent() {
    console.log(
        "AI auto-publish is disabled by the approval-only policy. " +
        "Pending content must be reviewed and approved in the admin UI."
    );
    return [];
}

export default {
    autoPublishDueAIContent
};
