/**
 * Mizito Automation Configuration Template
 * Replace the placeholder IDs with your own Mizito organization IDs.
 */
window.MIZITO_CONFIG = {
  // Your Mizito Project ID (obtained from URL: /#/ws/projects/dialog/[project_id]/)
  projectId: "YOUR_PROJECT_ID_HERE",

  // User ObjectIds from your Mizito workspace
  users: {
    CREATOR: "USER_ID_1",
    EDITOR: "USER_ID_2",
    SUPERVISOR: "USER_ID_3",
    PUBLISHER: "USER_ID_4"
  },

  // Tag / Label ObjectIds (optional)
  tags: {
    CALENDAR: "TAG_ID_CALENDAR" // Optional calendar label
  }
};
