// Tagging a message with the "work" label also takes it out of the inbox (archive).
// Archive only: nothing is deleted or binned, and removing the label does not un-archive.
export const WORK_LABEL_SLUG = 'work';

export const WORK_LABEL_ARCHIVE_UPDATES = Object.freeze({ archived: true, in_inbox: false });

const normalise = (label) => String(label ?? '').trim().toLowerCase();

export const hasWorkLabel = (labels) => Array.isArray(labels) && labels.some((label) => normalise(label) === WORK_LABEL_SLUG);

/**
 * Extra field updates to apply with a label change.
 * Only fires when "work" is being added (not already present), and never for
 * mail sitting in Bin or Spam, so labelling cannot resurrect those.
 */
export const workLabelArchiveUpdates = (previousLabels, nextLabels, email = {}) => {
    if (!hasWorkLabel(nextLabels) || hasWorkLabel(previousLabels)) return {};
    if (email.bin || email.spam) return {};
    return { ...WORK_LABEL_ARCHIVE_UPDATES };
};
