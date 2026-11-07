/**
 * Mizito Automation Engine (Modular API Helpers)
 */
(function() {
  const cfg = window.MIZITO_CONFIG || {};
  const PROJECT_ID = cfg.projectId || "YOUR_PROJECT_ID_HERE";

  function getServices() {
    const el = document.querySelector('.gantt-view-page') || document.body;
    const injector = angular.element(el).injector();
    if (!injector) throw new Error("AngularJS injector not found. Open Mizito Gantt tab first.");
    return {
      services: injector.get('services'),
      AppGanttManager: injector.get('AppGanttManager'),
      AppTasksManager: injector.get('AppTasksManager')
    };
  }

  window.MizitoAPI = {
    getServices,
    addTask: async (taskData) => {
      const { services } = getServices();
      return await services.invokeApi("tasks.add", { project: PROJECT_ID, ...taskData });
    },
    addGanttLink: async (fromTaskId, toTaskId) => {
      const { services } = getServices();
      return await services.invokeApi("projects.ganttTaskLinkAdd", {
        project: PROJECT_ID,
        fromTaskId,
        toTaskId
      });
    },
    getGanttData: async () => {
      const { services } = getServices();
      return await services.invokeApi("projects.getGanttData", { project: PROJECT_ID });
    }
  };
})();
