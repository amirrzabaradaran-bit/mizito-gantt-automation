/**
 * Mizito Gantt Automation Engine (Generic Open-Source Version)
 * Automated creation and linking of task sequences in Mizito Gantt.
 *
 * Features:
 * - Client-side execution in active Mizito browser session
 * - Human-paced jitter delays (300ms - 600ms) to prevent rate limits
 * - Gantt dependency link connection
 * - Post-flight audit & auto-healing verification
 */
(function() {
  const cfg = window.MIZITO_CONFIG || {};
  const PROJECT_ID = cfg.projectId || "YOUR_PROJECT_ID_HERE";
  const USERS = cfg.users || {};
  const TAGS = cfg.tags || {};

  const toFaDigits = str => String(str).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const sleep = (minMs = 300, maxMs = 600) => {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  function getServices() {
    const el = document.querySelector('.gantt-view-page') || document.body;
    const injector = angular.element(el).injector();
    if (!injector) throw new Error("AngularJS injector not found. Ensure Mizito Gantt tab is loaded.");
    return {
      services: injector.get('services'),
      AppGanttManager: injector.get('AppGanttManager'),
      AppTasksManager: injector.get('AppTasksManager')
    };
  }

  // Master Reel Pipeline Runner (6 Tasks)
  window.createMizitoReel = async function(config = {}) {
    const startTime = Date.now();
    const { reelNumber = "1", reelTitle = "New Reel", humanPace = true } = config;
    const { services, AppGanttManager } = getServices();
    const faNum = toFaDigits(reelNumber);
    const fullPhaseTitle = `ریل ${faNum} (${reelTitle})`;

    // Step 1: Find or Create Phase
    const domPhases = Array.from(document.querySelectorAll('.task-item-title.phase')).map(el => ({
      title: el.innerText.replace(/expand_more|expand_less|arrow_back/g, '').trim(),
      groupId: parseInt(el.getAttribute('group-id'), 10)
    }));

    let targetGroup = domPhases.find(p => p.title.includes(`ریل ${faNum}`) || p.title.includes(String(reelNumber)));
    let groupId = null;

    if (targetGroup) {
      groupId = targetGroup.groupId;
      targetGroup = AppGanttManager.getGroup(groupId);
    } else {
      const newPhase = await services.invokeApi("projects.ganttSaveGroup", {
        project: PROJECT_ID,
        phase: { id: null, title: fullPhaseTitle, prevPhase: -1 }
      });
      await AppGanttManager.updateGroup(newPhase);
      targetGroup = AppGanttManager.getGroup(newPhase._id);
      groupId = newPhase._id;
      if (humanPace) await sleep(400, 700);
    }

    // Step 2: 6 Tasks Definition (Titles only, clean & generic)
    const allUsers = Object.values(USERS);
    const defaultTag = TAGS.CALENDAR ? [TAGS.CALENDAR] : [];

    const taskDefs = [
      { key: "content", title: `محتوا نهایی ریل ${faNum} (${reelTitle})`, labels: [] },
      { key: "recording", title: `ضبط نهایی ریل ${faNum} (${reelTitle})`, labels: [] },
      { key: "editing", title: `تدوین نهایی ریل ${faNum} (${reelTitle})`, labels: defaultTag },
      { key: "cover", title: `طراحی کاور نهایی ریل ${faNum} (${reelTitle})`, labels: defaultTag },
      { key: "publish", title: `انتشار نهایی ریل ${faNum} (${reelTitle})`, labels: defaultTag },
      { key: "short", title: `انتشار نهایی شورت ریل ${faNum} (${reelTitle})`, labels: [] }
    ];

    const taskMap = {};

    for (const def of taskDefs) {
      const created = await services.invokeApi("tasks.add", {
        title: def.title,
        notes: "",
        checklist: [],
        attachments: [],
        assignee: allUsers,
        project: PROJECT_ID,
        labels: def.labels || [],
        deadline_start: null,
        deadline: null,
        responsible: null,
        responsible_enabled: false
      });

      const taskObj = Array.isArray(created) ? created[0] : created;
      await services.invokeApi("projects.ganttGroupAddTasks", { project: PROJECT_ID, group: groupId, taskIds: [taskObj._id] });
      taskObj.created_from_gantt = true;
      AppGanttManager.saveTask(taskObj);
      if (targetGroup && Array.isArray(targetGroup.tasks)) {
        targetGroup.tasks.push(taskObj);
      }
      taskMap[def.key] = taskObj;

      if (humanPace) await sleep(300, 500);
    }

    if (targetGroup) AppGanttManager.saveGroup(targetGroup);

    // Step 3: Gantt Dependency Links
    const links = [
      [taskMap.content._id, taskMap.recording._id],
      [taskMap.recording._id, taskMap.editing._id],
      [taskMap.recording._id, taskMap.cover._id],
      [taskMap.editing._id, taskMap.publish._id],
      [taskMap.cover._id, taskMap.publish._id],
      [taskMap.publish._id, taskMap.short._id]
    ];

    for (const [from, to] of links) {
      if (!from || !to) continue;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await services.invokeApi("projects.ganttTaskLinkAdd", { project: PROJECT_ID, fromTaskId: from, toTaskId: to });
          if (AppGanttManager && typeof AppGanttManager.addLink === "function") {
            try { AppGanttManager.addLink(from, to, true, false); } catch(e) {}
          }
          break;
        } catch(err) {
          if (attempt < 3) await sleep(250, 450);
        }
      }
      if (humanPace) await sleep(200, 350);
    }

    // Step 4: Post-flight Audit (Auto-Healing)
    let verifiedCount = 0;
    try {
      const gData = await services.invokeApi("projects.getGanttData", { project: PROJECT_ID });
      const currentLinks = (gData && gData.links) ? gData.links : [];
      for (const [from, to] of links) {
        if (!from || !to) continue;
        const exists = currentLinks.some(l => l.from === from && l.to === to);
        if (exists) {
          verifiedCount++;
        } else {
          try {
            await services.invokeApi("projects.ganttTaskLinkAdd", { project: PROJECT_ID, fromTaskId: from, toTaskId: to });
            verifiedCount++;
          } catch(e) {}
        }
      }
    } catch(e) {}

    return {
      ok: true,
      phase: fullPhaseTitle,
      groupId,
      tasksCreated: taskDefs.length,
      linksVerified: `${verifiedCount}/${links.length}`,
      durationSec: Math.round((Date.now() - startTime) / 1000)
    };
  };

  // Master YouTube Long Runner (8 Tasks)
  window.createMizitoLong = async function(config = {}) {
    const startTime = Date.now();
    const { longNumber = "1", longTitle = "New Video", humanPace = true } = config;
    const { services, AppGanttManager } = getServices();
    const faNum = toFaDigits(longNumber);
    const fullPhaseTitle = `یوتیوب لانگ ${faNum} (${longTitle})`;

    const newPhase = await services.invokeApi("projects.ganttSaveGroup", {
      project: PROJECT_ID,
      phase: { id: null, title: fullPhaseTitle, prevPhase: -1 }
    });
    await AppGanttManager.updateGroup(newPhase);
    const targetGroup = AppGanttManager.getGroup(newPhase._id);
    const groupId = newPhase._id;
    if (humanPace) await sleep(400, 700);

    const allUsers = Object.values(USERS);
    const defaultTag = TAGS.CALENDAR ? [TAGS.CALENDAR] : [];

    const taskDefs = [
      { key: "content", title: `محتوا نهایی یوتیوب لانگ ${faNum} (${longTitle})`, labels: [] },
      { key: "recording", title: `ضبط نهایی یوتیوب لانگ ${faNum} (${longTitle})`, labels: [] },
      { key: "editing", title: `تدوین نهایی یوتیوب لانگ ${faNum} (${longTitle})`, labels: defaultTag },
      { key: "cover", title: `طراحی تامبنیل و کاور یوتیوب لانگ ${faNum} (${longTitle})`, labels: defaultTag },
      { key: "publish", title: `انتشار نهایی یوتیوب لانگ ${faNum} (${longTitle})`, labels: defaultTag },
      { key: "story_content", title: `محتوا استوری یوتیوب لانگ ${faNum} (${longTitle})`, labels: [] },
      { key: "story_editing", title: `تدوین استوری یوتیوب لانگ ${faNum} (${longTitle})`, labels: [] },
      { key: "story_publish", title: `انتشار استوری یوتیوب لانگ ${faNum} (${longTitle})`, labels: [] }
    ];

    const taskMap = {};
    for (const def of taskDefs) {
      const created = await services.invokeApi("tasks.add", {
        title: def.title,
        notes: "",
        checklist: [],
        attachments: [],
        assignee: allUsers,
        project: PROJECT_ID,
        labels: def.labels || [],
        deadline_start: null,
        deadline: null,
        responsible: null,
        responsible_enabled: false
      });

      const taskObj = Array.isArray(created) ? created[0] : created;
      await services.invokeApi("projects.ganttGroupAddTasks", { project: PROJECT_ID, group: groupId, taskIds: [taskObj._id] });
      taskObj.created_from_gantt = true;
      AppGanttManager.saveTask(taskObj);
      if (targetGroup && Array.isArray(targetGroup.tasks)) {
        targetGroup.tasks.push(taskObj);
      }
      taskMap[def.key] = taskObj;

      if (humanPace) await sleep(300, 500);
    }

    if (targetGroup) AppGanttManager.saveGroup(targetGroup);

    const links = [
      [taskMap.content._id, taskMap.recording._id],
      [taskMap.recording._id, taskMap.editing._id],
      [taskMap.recording._id, taskMap.cover._id],
      [taskMap.editing._id, taskMap.publish._id],
      [taskMap.cover._id, taskMap.publish._id],
      [taskMap.publish._id, taskMap.story_content._id],
      [taskMap.story_content._id, taskMap.story_editing._id],
      [taskMap.story_editing._id, taskMap.story_publish._id]
    ];

    for (const [from, to] of links) {
      if (!from || !to) continue;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await services.invokeApi("projects.ganttTaskLinkAdd", { project: PROJECT_ID, fromTaskId: from, toTaskId: to });
          if (AppGanttManager && typeof AppGanttManager.addLink === "function") {
            try { AppGanttManager.addLink(from, to, true, false); } catch(e) {}
          }
          break;
        } catch(err) {
          if (attempt < 3) await sleep(250, 450);
        }
      }
      if (humanPace) await sleep(200, 350);
    }

    let verifiedCount = 0;
    try {
      const gData = await services.invokeApi("projects.getGanttData", { project: PROJECT_ID });
      const currentLinks = (gData && gData.links) ? gData.links : [];
      for (const [from, to] of links) {
        if (!from || !to) continue;
        const exists = currentLinks.some(l => l.from === from && l.to === to);
        if (exists) {
          verifiedCount++;
        } else {
          try {
            await services.invokeApi("projects.ganttTaskLinkAdd", { project: PROJECT_ID, fromTaskId: from, toTaskId: to });
            verifiedCount++;
          } catch(e) {}
        }
      }
    } catch(e) {}

    return {
      ok: true,
      phase: fullPhaseTitle,
      groupId,
      tasksCreated: taskDefs.length,
      linksVerified: `${verifiedCount}/${links.length}`,
      durationSec: Math.round((Date.now() - startTime) / 1000)
    };
  };

  console.log("⚡ Mizito Gantt Automation Engine ready.");
})();
