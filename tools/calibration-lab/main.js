import { formatDayCount, getWindowMetric } from './presentation.mjs';

const elements = {
  scenario: document.querySelector('#preset-history'),
  description: document.querySelector('#scenario-description'),
  outcome: document.querySelector('#outcome'),
  status: document.querySelector('#status'),
  headline: document.querySelector('#headline'),
  summary: document.querySelector('#summary'),
  targetChange: document.querySelector('#target-change'),
  metrics: document.querySelector('#metrics'),
  estimates: document.querySelector('#estimates'),
  criteriaPanel: document.querySelector('#criteria-panel'),
  criteriaTitle: document.querySelector('#criteria-title'),
  criteria: document.querySelector('#criteria'),
  activity: document.querySelector('#activity-context'),
  input: document.querySelector('#history-input'),
  evaluate: document.querySelector('#evaluate'),
  error: document.querySelector('#error'),
  output: document.querySelector('#output')
};

let scenarios = [];
let selectedScenarioId = null;

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function formatNumber(value, precision = 0) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  });
}

function formatInterval(value, unit, precision = 0) {
  if (!value) return 'Not enough evidence';
  return `${formatNumber(value.midpoint, precision)} ${unit} (${formatNumber(value.low, precision)} to ${formatNumber(value.high, precision)})`;
}

function appendLabeledValue(container, className, label, value) {
  const item = document.createElement('div');
  item.className = className;
  const strong = document.createElement('strong');
  const span = document.createElement('span');
  strong.textContent = String(value);
  span.textContent = label;
  item.append(strong, span);
  container.append(item);
}

function renderResult(result) {
  const uncertainDays = result.dataQuality.missingDays + result.dataQuality.incompleteDays + result.dataQuality.suspiciousDays;
  elements.outcome.className = `outcome ${result.status}`;
  elements.status.textContent = result.status.replace('_', ' ');
  elements.headline.textContent = result.headline;
  elements.summary.textContent = result.summary;

  elements.targetChange.replaceChildren();
  elements.targetChange.hidden = !result.recommendation;
  if (result.recommendation) {
    for (const [label, value] of [
      ['Current target', `${formatNumber(result.recommendation.currentTargetKcal)} kcal`],
      ['Suggested target', `${formatNumber(result.recommendation.recommendedTargetKcal)} kcal`]
    ]) {
      const group = document.createElement('span');
      const small = document.createElement('small');
      const strong = document.createElement('strong');
      small.textContent = label;
      strong.textContent = value;
      group.append(small, strong);
      elements.targetChange.append(group);
    }
    const change = document.createElement('em');
    const step = result.recommendation.adjustmentStepKcal;
    change.textContent = `${step > 0 ? '+' : ''}${step} kcal`;
    elements.targetChange.append(change);
  }

  elements.metrics.replaceChildren();
  const windowMetric = getWindowMetric(result);
  appendLabeledValue(elements.metrics, 'metric', windowMetric.label, windowMetric.value);
  appendLabeledValue(elements.metrics, 'metric', 'confident days', result.dataQuality.confidentDays);
  appendLabeledValue(elements.metrics, 'metric', 'uncertain days', uncertainDays);
  appendLabeledValue(elements.metrics, 'metric', 'weight span', formatDayCount(result.dataQuality.weightSpanDays));

  elements.estimates.replaceChildren();
  const estimates = [
    ['Average intake', formatInterval(result.estimates.averageIntakeKcal, 'kcal/day')],
    ['Observed pace', formatInterval(result.estimates.observedWeeklyWeightChangeKg, 'kg/week', 2)],
    ['Target correction', formatInterval(result.estimates.targetAdjustmentKcal, 'kcal/day')]
  ];
  for (const [label, value] of estimates) {
    const item = document.createElement('div');
    item.className = 'estimate';
    const span = document.createElement('span');
    const strong = document.createElement('strong');
    span.textContent = label;
    strong.textContent = value;
    item.append(span, strong);
    elements.estimates.append(item);
  }

  const criteriaSatisfied = result.missingCriteria.length === 0;
  elements.criteriaPanel.classList.toggle('satisfied', criteriaSatisfied);
  elements.criteriaTitle.textContent = criteriaSatisfied ? 'Criteria satisfied' : 'Why no stronger action';
  elements.criteria.replaceChildren();
  if (criteriaSatisfied) {
    const copy = document.createElement('p');
    copy.className = 'criteria-copy';
    copy.textContent = 'No missing evidence criteria for this observation window.';
    elements.criteria.append(copy);
  } else {
    const list = document.createElement('ul');
    for (const criterion of result.missingCriteria) {
      const item = document.createElement('li');
      item.textContent = criterion;
      list.append(item);
    }
    elements.criteria.append(list);
  }

  elements.activity.replaceChildren();
  elements.activity.hidden = !result.activityContext;
  if (result.activityContext) {
    const strong = document.createElement('strong');
    const span = document.createElement('span');
    strong.textContent = 'Activity context only';
    span.textContent = `${result.activityContext.observedDays} days | ${formatNumber(result.activityContext.averageSteps ?? 0)} steps | ${formatNumber(result.activityContext.averageActiveCaloriesKcal ?? 0)} active kcal`;
    elements.activity.append(strong, span);
  }
  elements.output.textContent = formatJson(result);
}

async function evaluateInput() {
  elements.evaluate.disabled = true;
  try {
    const input = JSON.parse(elements.input.value);
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message ?? 'Unable to evaluate history.');
    elements.error.hidden = true;
    renderResult(body);
  } catch (error) {
    elements.error.textContent = error instanceof Error ? error.message : 'Invalid calibration history.';
    elements.error.hidden = false;
  } finally {
    elements.evaluate.disabled = false;
  }
}

function selectScenario(scenarioId) {
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId);
  if (!scenario) return;
  selectedScenarioId = scenario.id;
  elements.scenario.value = scenario.id;
  elements.description.textContent = scenario.description;
  elements.input.value = formatJson(scenario.input);
  const url = new URL(window.location.href);
  url.searchParams.set('scenario', scenario.id);
  window.history.replaceState(null, '', url);
  void evaluateInput();
}

elements.scenario.addEventListener('change', () => selectScenario(elements.scenario.value));
elements.input.addEventListener('input', () => {
  selectedScenarioId = null;
  elements.description.textContent = 'Custom JSON input. Select a preset to restore a known history.';
  const url = new URL(window.location.href);
  url.searchParams.delete('scenario');
  window.history.replaceState(null, '', url);
});
elements.evaluate.addEventListener('click', () => void evaluateInput());

const response = await fetch('/api/scenarios');
scenarios = await response.json();
for (const scenario of scenarios) {
  const option = document.createElement('option');
  option.value = scenario.id;
  option.textContent = scenario.name;
  elements.scenario.append(option);
}
const requestedScenario = new URLSearchParams(window.location.search).get('scenario');
selectScenario(scenarios.some((scenario) => scenario.id === requestedScenario) ? requestedScenario : scenarios[0].id);
