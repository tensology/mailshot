const PANEL_MARGIN = 16;

export const getDefaultReadSummaryPosition = ({
    viewportWidth = 0,
    viewportHeight = 0,
    panelWidth = 384,
    panelHeight = 160
} = {}) => ({
    x: PANEL_MARGIN,
    y: Math.max(PANEL_MARGIN, viewportHeight - panelHeight - PANEL_MARGIN)
});

export const clampReadSummaryPosition = ({
    x = PANEL_MARGIN,
    y = PANEL_MARGIN,
    viewportWidth = 0,
    viewportHeight = 0,
    panelWidth = 384,
    panelHeight = 160
} = {}) => {
    const maxX = Math.max(PANEL_MARGIN, viewportWidth - panelWidth - PANEL_MARGIN);
    const maxY = Math.max(PANEL_MARGIN, viewportHeight - panelHeight - PANEL_MARGIN);

    return {
        x: Math.min(Math.max(PANEL_MARGIN, x), maxX),
        y: Math.min(Math.max(PANEL_MARGIN, y), maxY)
    };
};
