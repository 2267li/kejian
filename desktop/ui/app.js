(function () {
  'use strict';

  const { dateKey, parseDate, extract, makeCalendar } = window.Kejian;
  const STORAGE_KEY = 'kejian-notice-tasks-v1';
  const BACKUP_STATUS_KEY = 'kejian-desktop-backup-status-v1';
  const MAX_TASKS = 5000;
  const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
  const PAGE_SIZE = 50;
  const CATEGORIES = ['作业', '考试', '活动', '其他'];
  const $ = id => document.getElementById(id);

  const state = {
    tasks: [],
    filter: 'pending',
    search: '',
    page: 1,
    section: 'workspace',
    draft: null,
    editingId: null,
    draftFields: null,
    deletedTask: null,
    pendingImport: null,
    storageBlocked: false,
    lastBackup: null
  };
  let toastTimer;
  let undoTimer;
  let importSequence = 0;
  let savingFile = false;

  function bind(id, event, handler) {
    $(id)?.addEventListener(event, handler);
  }

  function text(id, value) {
    if ($(id)) $(id).textContent = value;
  }

  function node(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  }

  function toast(message) {
    clearTimeout(toastTimer);
    const notification = $('toast');
    notification.querySelector('span').textContent = message;
    $('undoBtn').classList.toggle('hidden', !state.deletedTask);
    notification.classList.remove('hidden');
    const remainingUndo = state.deletedTask ? state.deletedTask.expiresAt - Date.now() : 0;
    toastTimer = setTimeout(() => notification.classList.add('hidden'), Math.max(5500, remainingUndo));
  }

  function clearUndo() {
    clearTimeout(undoTimer);
    state.deletedTask = null;
    $('undoBtn').classList.add('hidden');
  }

  // Keep the existing backup schema, but store only its documented fields.
  function normalizeTasks(value) {
    if (!Array.isArray(value) || value.length > MAX_TASKS) {
      throw new Error('待办最多可保存 5000 条，请减少记录后再试。');
    }
    const ids = new Set();
    return value.map(task => {
      const valid = task && typeof task === 'object' &&
        typeof task.id === 'string' && task.id.trim().length > 0 && task.id.length < 200 &&
        typeof task.title === 'string' && task.title.trim().length > 0 && task.title.length <= 120 &&
        typeof task.date === 'string' && (task.date === '' || Boolean(parseDate(task.date))) &&
        typeof task.time === 'string' && (task.time === '' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(task.time)) &&
        (!task.time || task.date) && CATEGORIES.includes(task.category) &&
        typeof task.notes === 'string' && task.notes.length <= 3000 &&
        typeof task.source === 'string' && task.source.length <= 10000 &&
        typeof task.done === 'boolean';
      if (!valid || ids.has(task.id)) throw new Error('待办内容不完整或存在重复记录，请检查备份。');
      ids.add(task.id);
      return {
        id: task.id,
        title: task.title.trim(),
        date: task.date,
        time: task.time,
        category: task.category,
        notes: task.notes,
        source: task.source,
        done: task.done,
        createdAt: typeof task.createdAt === 'string' && task.createdAt.length <= 50
          ? task.createdAt : new Date().toISOString()
      };
    });
  }

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) state.tasks = normalizeTasks(JSON.parse(raw));
    } catch (_) {
      state.storageBlocked = true;
      setTimeout(() => toast('本机记录暂时无法读取。原有内容已保留，请选择一份有效备份恢复。'), 100);
    }
    try {
      const backup = JSON.parse(localStorage.getItem(BACKUP_STATUS_KEY));
      if (backup && typeof backup.savedAt === 'string' && Number.isFinite(Date.parse(backup.savedAt))) {
        state.lastBackup = backup;
      }
    } catch (_) {
      // A missing backup timestamp must never prevent access to the tasks.
    }
  }

  function persist(nextTasks, { recover = false } = {}) {
    if (state.storageBlocked && !recover) {
      toast('本机记录暂时无法读取，修改尚未保存。请先从有效备份恢复。');
      return false;
    }
    let clean;
    try {
      clean = normalizeTasks(nextTasks);
    } catch (error) {
      toast(error.message);
      return false;
    }
    try {
      // setItem is atomic: retain the current state and draft if writing fails.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch (_) {
      toast('没有保存成功，本机空间不足或暂时无法写入。草稿和现有待办已保留，请先保存备份。');
      return false;
    }
    state.tasks = clean;
    state.storageBlocked = false;
    render();
    return true;
  }

  function showSection(section) {
    const nextSection = section === 'data' ? 'data' : 'workspace';
    const changed = state.section !== nextSection;
    state.section = nextSection;
    $('workspaceSection')?.classList.toggle('hidden', state.section !== 'workspace');
    $('dataSection')?.classList.toggle('hidden', state.section !== 'data');
    document.querySelectorAll('button[data-section]').forEach(button => {
      const active = button.dataset.section === state.section;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    text('pageTitle', state.section === 'workspace' ? '待办工作台' : '备份与恢复');
    text('pageSubtitle', state.section === 'workspace'
      ? '粘贴通知，核对草稿，再一件件完成。'
      : '给待办留一份备份，换电脑也能接着用。');
    if (changed) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function updateNoticeCount() {
    text('noticeCount', `${$('notice').value.length} / 10000`);
  }

  function readDraftFields() {
    return {
      title: $('taskTitle').value,
      date: $('taskDate').value,
      time: $('taskTime').value,
      category: $('taskCategory').value,
      notes: $('taskNotes').value
    };
  }

  function draftWasEdited() {
    return state.draft && JSON.stringify(readDraftFields()) !== JSON.stringify(state.draftFields);
  }

  function hasPendingDraft() {
    return Boolean(state.draft && (!state.editingId || draftWasEdited()));
  }

  function confirmDiscardDraft(message) {
    return !hasPendingDraft() || window.confirm(message);
  }

  function showDraft(value, editingId = null) {
    showSection('workspace');
    state.draft = value;
    state.editingId = editingId;
    text('draftHeading', editingId ? '修改待办' : '核对待办草稿');
    text('saveBtn', editingId ? '保存修改' : '加入待办');
    $('taskTitle').value = value.title;
    $('taskDate').value = value.date;
    $('taskTime').value = value.time;
    $('taskCategory').value = value.category;
    $('taskNotes').value = value.notes;
    state.draftFields = readDraftFields();
    text('dateEvidence', value.evidence ? `日期依据：${value.evidence}，以通知发送日期为准。` : '');
    const warnings = value.warnings || [];
    $('warnings').replaceChildren();
    if (warnings.length) {
      const list = node('ul');
      warnings.forEach(warning => list.append(node('li', '', warning)));
      $('warnings').append(list);
    }
    $('warnings').classList.toggle('hidden', warnings.length === 0);
    $('draftForm').classList.remove('hidden');
    $('taskTitle').focus({ preventScroll: true });
    $('draftForm').scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  function closeDraft() {
    state.draft = null;
    state.editingId = null;
    state.draftFields = null;
    $('draftForm').classList.add('hidden');
  }

  function extractNotice() {
    const notice = $('notice').value.trim();
    if (!notice) {
      toast('先粘贴一条通知，也可以点一个示例试试。');
      $('notice').focus();
      return;
    }
    if (notice.length > 10000) {
      toast('一次最多整理 10000 字，请只保留一件事的通知内容。');
      return;
    }
    if (!confirmDiscardDraft('当前草稿还没有保存，重新整理会替换它。继续吗？')) return;
    try {
      showDraft(extract(notice, $('reference').value));
    } catch (error) {
      toast(error.message);
      $('reference').focus();
    }
  }

  function saveDraft(event) {
    event.preventDefault();
    if (!state.draft) return;
    const fields = readDraftFields();
    const title = fields.title.trim();
    if (!title || title.length > 120) {
      toast('请填写 1 至 120 字的待办名称。');
      $('taskTitle').focus();
      return;
    }
    if (fields.date && !parseDate(fields.date)) {
      toast('请选择有效的截止日期。');
      $('taskDate').focus();
      return;
    }
    if (fields.time && !fields.date) {
      toast('填写截止时间前，请先选择日期。');
      $('taskDate').focus();
      return;
    }
    const existing = state.editingId ? state.tasks.find(task => task.id === state.editingId) : null;
    if (state.editingId && !existing) {
      toast('这条待办已经被删除，修改尚未保存。可先撤销删除，再保存草稿。');
      return;
    }
    const item = {
      id: existing?.id || globalThis.crypto.randomUUID(),
      title,
      date: fields.date,
      time: fields.time,
      category: fields.category,
      notes: fields.notes.trim(),
      source: state.draft.source,
      done: existing?.done || false,
      createdAt: existing?.createdAt || new Date().toISOString()
    };
    const next = existing
      ? state.tasks.map(task => task.id === item.id ? item : task)
      : [...state.tasks, item];
    if (!persist(next)) return;

    closeDraft();
    if (!existing) {
      $('notice').value = '';
      updateNoticeCount();
      state.filter = 'pending';
      state.page = 1;
    } else if (state.filter !== 'all') {
      state.filter = item.done ? 'done' : 'pending';
    }
    clearSearch();
    revealTask(item.id);
    toast(existing ? '修改已保存。' : '已加入待办，保存在这台电脑。');
  }

  function isOverdue(task, now) {
    if (task.done || !task.date) return false;
    const today = dateKey(now);
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return task.date < today || (task.date === today && Boolean(task.time) && task.time < time);
  }

  function dueText(task, now) {
    if (!task.date) return '日期待定';
    const due = parseDate(task.date);
    const days = Math.round((Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()) -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    const labels = { 0: '今天', 1: '明天', 2: '后天' };
    const label = labels[days] || `${due.getFullYear() !== now.getFullYear() ? `${due.getFullYear()}年` : ''}${due.getMonth() + 1}月${due.getDate()}日`;
    return label + (task.time ? ` ${task.time}` : '') + (isOverdue(task, now) ? ' · 已逾期' : '');
  }

  function filteredTasks() {
    return state.tasks.filter(task => {
      const matchesFilter = state.filter === 'all' || (state.filter === 'done' ? task.done : !task.done);
      const searchable = `${task.title}\n${task.notes}\n${task.source}\n${task.category}\n${task.date}`.toLocaleLowerCase();
      return matchesFilter && (!state.search || searchable.includes(state.search));
    }).sort((a, b) => Number(a.done) - Number(b.done) ||
      `${a.date || '9999'} ${a.time || '23:59'}`.localeCompare(`${b.date || '9999'} ${b.time || '23:59'}`));
  }

  function clearSearch() {
    state.search = '';
    if ($('taskSearch')) $('taskSearch').value = '';
  }

  function focusTask(id) {
    const card = Array.from($('taskList').children).find(element => element.dataset.id === id);
    if (card) {
      card.focus({ preventScroll: true });
      card.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }

  function revealTask(id) {
    const index = filteredTasks().findIndex(task => task.id === id);
    if (index >= 0) state.page = Math.floor(index / PAGE_SIZE) + 1;
    showSection('workspace');
    render();
    focusTask(id);
  }

  function restoreListFocus(id, previousIndex) {
    const cards = Array.from($('taskList').querySelectorAll('.task'));
    const card = cards.find(element => element.dataset.id === id) || cards[Math.min(previousIndex, cards.length - 1)];
    if (card) {
      card.querySelector('.task-toggle').focus({ preventScroll: true });
      card.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    } else if ($('tasksTitle')) {
      $('tasksTitle').tabIndex = -1;
      $('tasksTitle').focus({ preventScroll: true });
    }
  }

  function toggleTask(task) {
    const position = Array.from($('taskList').children).findIndex(card => card.dataset.id === task.id);
    const next = state.tasks.map(item => item.id === task.id ? { ...item, done: !item.done } : item);
    if (persist(next)) {
      restoreListFocus(task.id, position);
      toast(task.done ? '已恢复到待完成。' : '已标记完成。');
    }
  }

  function editTask(task) {
    if (!confirmDiscardDraft('当前草稿还没有保存，打开这条待办会替换它。继续吗？')) return;
    showDraft({ ...task, warnings: [], evidence: '' }, task.id);
  }

  function deleteTask(task) {
    const index = state.tasks.findIndex(item => item.id === task.id);
    const position = Array.from($('taskList').children).findIndex(card => card.dataset.id === task.id);
    if (!persist(state.tasks.filter(item => item.id !== task.id))) return;
    restoreListFocus(null, position);
    clearUndo();
    state.deletedTask = { task: { ...task }, index, expiresAt: Date.now() + 30000 };
    undoTimer = setTimeout(clearUndo, 30000);
    toast('已删除这条待办，可在 30 秒内撤销。');
  }

  function undoDelete() {
    const deleted = state.deletedTask;
    if (!deleted) return;
    if (state.tasks.some(task => task.id === deleted.task.id)) {
      clearUndo();
      toast('这条待办已在当前列表中，保留了现有内容。');
      return;
    }
    const next = state.tasks.slice();
    next.splice(Math.min(deleted.index, next.length), 0, deleted.task);
    if (!persist(next)) return;
    clearUndo();
    state.filter = deleted.task.done ? 'done' : 'pending';
    clearSearch();
    revealTask(deleted.task.id);
    toast('已撤销删除，其他修改保持不变。');
  }

  function taskCard(task, now) {
    const card = node('article', `task${task.done ? ' completed' : ''}`);
    card.dataset.id = task.id;
    card.tabIndex = -1;
    const toggle = node('button', 'task-toggle', task.done ? '✓' : '');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', `${task.done ? '恢复待办' : '标记完成'}：${task.title}`);
    toggle.setAttribute('aria-pressed', String(task.done));
    toggle.addEventListener('click', () => toggleTask(task));

    const body = node('div', 'task-body');
    body.append(node('h3', 'task-title', task.title));
    const meta = node('div', 'task-meta');
    const categoryClass = task.category === '考试' ? ' exam' : task.category === '活动' ? ' event' : '';
    meta.append(node('span', `tag${categoryClass}`, task.category));
    meta.append(node('span', `due${isOverdue(task, now) ? ' late' : ''}`, dueText(task, now)));
    body.append(meta);
    if (task.notes) body.append(node('p', 'task-notes', task.notes));

    const controls = node('div', 'task-controls');
    const edit = node('button', '', '编辑');
    edit.type = 'button';
    edit.addEventListener('click', () => editTask(task));
    controls.append(edit);
    if (task.date) {
      const calendar = node('button', '', '保存到日历');
      calendar.type = 'button';
      calendar.addEventListener('click', () => exportCalendar([task]));
      controls.append(calendar);
    }
    const remove = node('button', 'delete-task', '删除');
    remove.type = 'button';
    remove.setAttribute('aria-label', `删除：${task.title}`);
    remove.addEventListener('click', () => deleteTask(task));
    controls.append(remove);
    body.append(controls);
    if (task.source) {
      const details = node('details', 'task-source');
      details.append(node('summary', '', '查看原通知'), node('p', '', task.source));
      body.append(details);
    }
    card.append(toggle, body);
    return card;
  }

  function renderBackupStatus() {
    text('backupCount', state.tasks.length);
    let message = '还没有保存过备份，建议定期保存一份。';
    if (state.storageBlocked) {
      message = '本机记录暂时无法读取，请选择有效备份恢复。';
    } else if (state.lastBackup) {
      const savedAt = new Date(state.lastBackup.savedAt);
      message = `上次保存备份：${savedAt.toLocaleString('zh-CN', { hour12: false })}`;
    }
    text('backupStatus', message);
  }

  function renderStatus(now) {
    const pending = state.tasks.filter(task => !task.done);
    text('pendingCount', pending.length);
    text('mobileCount', pending.length);
    text('todayCount', pending.filter(task => task.date === dateKey(now)).length);
    text('overdueCount', pending.filter(task => isOverdue(task, now)).length);
    text('totalCount', state.tasks.length);
    text('boardSummary', state.storageBlocked ? '本机记录暂时无法读取，请先从备份恢复。'
      : pending.length ? `还有 ${pending.length} 件事待完成，已按截止日期排列。` : '没有待完成的事。新通知来了，再收一条。');
    $('exportCalendar').disabled = !pending.some(task => task.date);
    ['backupBtn', 'transferExport'].forEach(id => {
      if ($(id)) $(id).disabled = state.tasks.length === 0;
    });
    renderBackupStatus();
  }

  function refreshClock() {
    const now = new Date();
    renderStatus(now);
    const tasksById = new Map(state.tasks.map(task => [task.id, task]));
    Array.from($('taskList').children).forEach(card => {
      const task = tasksById.get(card.dataset.id);
      const due = card.querySelector('.due');
      if (!task || !due) return;
      due.textContent = dueText(task, now);
      due.classList.toggle('late', Boolean(isOverdue(task, now)));
    });
  }

  function render() {
    const now = new Date();
    renderStatus(now);
    document.querySelectorAll('[data-filter]').forEach(button => {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const visible = filteredTasks();
    const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    state.page = Math.max(1, Math.min(state.page, pageCount));
    text('taskCountLabel', `${state.search ? '找到' : '共'} ${visible.length} 条`);
    text('taskPageLabel', `第 ${state.page} / ${pageCount} 页 · 共 ${visible.length} 条`);
    $('taskPagination')?.classList.toggle('hidden', visible.length <= PAGE_SIZE);
    if ($('previousPage')) $('previousPage').disabled = state.page === 1;
    if ($('nextPage')) $('nextPage').disabled = state.page === pageCount;

    const list = $('taskList');
    list.replaceChildren();
    if (!visible.length) {
      const empty = node('div', 'empty');
      const title = state.storageBlocked ? '记录读取遇到了问题' : state.search ? '没有找到匹配的待办'
        : state.filter === 'done' ? '完成的事情，会留在这里' : '这里暂时没有待办';
      const description = state.storageBlocked ? '原有内容已保留，可到“备份与数据”恢复有效备份。'
        : state.search ? '换个关键词试试，或者切换到“全部”。'
        : state.filter === 'done' ? '完成一件，勾选一件，进展就会留在这里。'
        : state.tasks.length ? '试试切换到“已完成”或“全部”。' : '在左侧粘贴通知，或选择一条示例开始。';
      empty.append(node('div', 'empty-icon', state.search ? '⌕' : '✓'), node('strong', '', title), node('p', '', description));
      list.append(empty);
      return;
    }
    const start = (state.page - 1) * PAGE_SIZE;
    const fragment = document.createDocumentFragment();
    visible.slice(start, start + PAGE_SIZE).forEach(task => fragment.append(taskCard(task, now)));
    list.append(fragment);
  }

  async function saveFile(content, filename) {
    if (savingFile) {
      toast('请先完成当前的文件保存。');
      return false;
    }
    savingFile = true;
    try {
      return await window.KejianDesktop.saveFile(content, filename);
    } catch (error) {
      toast(error.message || '文件没有保存成功，请换一个可写入的位置重试。');
      return false;
    } finally {
      savingFile = false;
    }
  }

  async function saveBackup() {
    if (!state.tasks.length) {
      toast('还没有待办，可以先保存一条。');
      return;
    }
    const exportedAt = new Date().toISOString();
    const content = JSON.stringify({ app: 'kejian', version: 1, exportedAt, tasks: state.tasks }, null, 2);
    if (!await saveFile(content, `课间备份-${dateKey(new Date())}.json`)) return;
    state.lastBackup = { savedAt: new Date().toISOString() };
    try {
      localStorage.setItem(BACKUP_STATUS_KEY, JSON.stringify(state.lastBackup));
    } catch (_) {
      // The backup file was saved even if the optional timestamp cannot be stored.
    }
    renderBackupStatus();
    toast('备份已保存。换电脑时，在新电脑选择这份文件恢复待办。');
  }

  async function exportCalendar(items) {
    const dated = items.filter(task => task.date);
    if (!dated.length) {
      toast('请先为待办设置日期。');
      return;
    }
    if (!await saveFile(makeCalendar(dated), '课间待办.ics')) return;
    const skipped = items.length - dated.length;
    toast(`已保存 ${dated.length} 条日历事项${skipped ? `，跳过 ${skipped} 条日期待定的事项` : ''}。请在日历软件中打开文件并设置提醒。`);
  }

  async function readBackup(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const sequence = ++importSequence;
    state.pendingImport = null;
    if (file.size > MAX_BACKUP_BYTES) {
      toast('备份文件过大，请选择 10 MB 以内的文件。');
      return;
    }
    try {
      const backup = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
      if (!backup || backup.app !== 'kejian' || backup.version !== 1) throw new Error('invalid backup');
      const tasks = normalizeTasks(backup.tasks);
      if (sequence !== importSequence) return;
      state.pendingImport = tasks;
      text('importSummary', `备份中有 ${tasks.length} 条待办，这台电脑中有 ${state.tasks.length} 条。请选择恢复方式。`);
      document.querySelector('[name="importMode"][value="merge"]').checked = true;
      openDialog('importDialog');
    } catch (_) {
      if (sequence === importSequence) toast('这不是有效的课间备份，现有记录未改变。请选择通过“保存备份”生成的文件。');
    }
  }

  function confirmImport() {
    if (state.pendingImport === null) return;
    const replace = document.querySelector('[name="importMode"]:checked')?.value === 'replace';
    const next = replace ? state.pendingImport
      : Array.from(new Map([...state.tasks, ...state.pendingImport].map(task => [task.id, task])).values());
    try {
      normalizeTasks(next);
    } catch (error) {
      toast(error.message);
      return;
    }
    const confirmations = [];
    if (state.storageBlocked) confirmations.push('当前记录无法读取，恢复备份会覆盖这部分本机数据。');
    else if (replace && state.tasks.length) confirmations.push(`将用备份中的 ${state.pendingImport.length} 条待办替换本机全部 ${state.tasks.length} 条记录。`);
    if (hasPendingDraft()) confirmations.push('正在核对的草稿还没有保存，恢复后会关闭它。');
    if (confirmations.length && !window.confirm(`${confirmations.join('\n')}\n确定继续吗？`)) return;
    if (!persist(next, { recover: state.storageBlocked })) return;
    state.pendingImport = null;
    closeDraft();
    $('importDialog').close();
    state.filter = 'pending';
    state.page = 1;
    clearSearch();
    showSection('workspace');
    render();
    toast('恢复完成，待办已保存在这台电脑。');
  }

  function openDialog(id) {
    const dialog = $(id);
    if (dialog && !dialog.open) dialog.showModal();
  }

  async function copyFeedback() {
    const feedback = $('feedbackText').value.trim();
    if (!feedback) {
      toast('先写一句你的使用感受。');
      $('feedbackText').focus();
      return;
    }
    const message = `【课间 Windows v__APP_VERSION__ 试用反馈】\n${feedback}`;
    try {
      await navigator.clipboard.writeText(message);
      toast('反馈已复制，可以粘贴到发布帖或项目的问题反馈区。');
    } catch (_) {
      if (await saveFile(message, '课间试用反馈.txt')) toast('反馈已保存为文件，可以自行发送给开发者。');
    }
  }

  const examples = {
    homework: '【实验课通知】请于下周三晚上八点前提交实验报告。格式为 PDF，文件名为“学号＋姓名”。提交到课程平台的实验二作业区。',
    event: '【校园活动】明天下午六点前完成摄影比赛报名。请填写报名表，作品命名为“专业＋姓名＋作品名”。',
    exam: '【考试安排】本周五上午九点参加高等数学测验。地点：教学楼 A203。请携带学生证、黑色签字笔。'
  };

  document.querySelectorAll('button[data-section]').forEach(button => {
    button.addEventListener('click', () => showSection(button.dataset.section));
  });
  document.querySelectorAll('[data-example]').forEach(button => {
    button.addEventListener('click', () => {
      const example = examples[button.dataset.example];
      if (!example) return;
      const replacesNotice = $('notice').value.trim() && $('notice').value !== example;
      if ((replacesNotice || hasPendingDraft()) && !window.confirm('使用示例会替换当前通知和未保存的草稿。继续吗？')) return;
      $('notice').value = example;
      $('reference').value = dateKey(new Date());
      closeDraft();
      updateNoticeCount();
      showSection('workspace');
      $('notice').focus();
    });
  });
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      if (!['pending', 'done', 'all'].includes(button.dataset.filter)) return;
      state.filter = button.dataset.filter;
      state.page = 1;
      render();
    });
  });
  document.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => $(button.dataset.close)?.close());
  });

  bind('notice', 'input', updateNoticeCount);
  bind('extractBtn', 'click', extractNotice);
  bind('draftForm', 'submit', saveDraft);
  bind('cancelDraft', 'click', () => {
    if (draftWasEdited() && !window.confirm('草稿中的修改还没有保存，确定取消吗？')) return;
    closeDraft();
    $('notice').focus();
  });
  bind('taskSearch', 'input', event => {
    state.search = event.target.value.trim().toLocaleLowerCase();
    state.page = 1;
    render();
  });
  bind('previousPage', 'click', () => { state.page -= 1; render(); $('taskList').scrollTop = 0; });
  bind('nextPage', 'click', () => { state.page += 1; render(); $('taskList').scrollTop = 0; });
  bind('undoBtn', 'click', undoDelete);
  bind('exportCalendar', 'click', () => exportCalendar(state.tasks.filter(task => !task.done)));
  ['backupBtn', 'transferExport'].forEach(id => bind(id, 'click', saveBackup));
  ['restoreBtn', 'transferImport'].forEach(id => bind(id, 'click', () => $('restoreInput').click()));
  bind('restoreInput', 'change', readBackup);
  bind('confirmImport', 'click', confirmImport);
  bind('importDialog', 'close', () => { state.pendingImport = null; });
  ['installBtn', 'moreBtn'].forEach(id => bind(id, 'click', () => showSection('data')));
  ['helpBtn', 'moreHelp'].forEach(id => bind(id, 'click', () => openDialog('helpDialog')));
  ['feedbackBtn', 'moreFeedback'].forEach(id => bind(id, 'click', () => openDialog('feedbackDialog')));
  bind('copyFeedback', 'click', copyFeedback);
  bind('showDataFolder', 'click', () => {
    try { window.KejianDesktop.showDataFolder(); }
    catch (_) { toast('暂时无法打开数据文件夹，请在程序旁查找“课间数据”文件夹。'); }
  });
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter' || document.querySelector('dialog[open]')) return;
    if ($('draftForm').contains(event.target)) {
      event.preventDefault();
      $('draftForm').requestSubmit();
    } else if (event.target === $('notice') || event.target === $('reference')) {
      event.preventDefault();
      extractNotice();
    }
  });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    try {
      state.tasks = event.newValue === null ? [] : normalizeTasks(JSON.parse(event.newValue));
      state.storageBlocked = false;
      render();
      toast('本机待办已更新，正在核对的草稿已保留。');
    } catch (_) {
      state.storageBlocked = true;
      render();
      toast('本机记录暂时无法读取，当前待办已保留。请先保存备份。');
    }
  });
  window.KejianApp = Object.freeze({
    hasUnsavedChanges() {
      return Boolean($('notice').value.trim() || hasPendingDraft());
    }
  });

  readStorage();
  $('reference').value = dateKey(new Date());
  updateNoticeCount();
  showSection('workspace');
  render();
  window.addEventListener('focus', refreshClock);
  setInterval(refreshClock, 60000);
})();
