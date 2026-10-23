(() => {
  const root = document.getElementById('tab-reports');
  const filter = root?.querySelector('.report-filter-card');
  const expenses = root?.querySelector('.expenses-panel');
  if (!filter || !expenses) return;
  const tabs = Array.from(root.querySelectorAll('.report-view-tabs [role="tab"]'));
  const income = document.createElement('div');
  const expense = document.createElement('div');
  income.id = 'report-income-panel'; expense.id = 'report-expense-panel';
  [income, expense].forEach((panel, index) => {
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tabs[index].id);
    panel.tabIndex = 0;
  });
  // Move the existing nodes so listeners, field values and loaded records survive.
  while (filter.nextSibling) income.append(filter.nextSibling);
  expense.append(expenses);
  root.append(income, expense);
  function select(index, focus = false) {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
    income.hidden = index !== 0; expense.hidden = index !== 1;
    if (focus) tabs[index].focus();
    if (index === 0) window.dispatchEvent(new Event('resize'));
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      const next = {ArrowRight:1-index, ArrowLeft:1-index, Home:0, End:1}[event.key];
      if (next == null) return;
      event.preventDefault(); select(next, true);
    });
  });
  select(0);
})();
