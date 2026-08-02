import { formatBudgetChange, formatBudgetInterval, formatDayCount, formatWeightInterval, getWindowMetric } from './presentation.mjs';

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
  criteriaDescription: document.querySelector('#criteria-description'),
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

function formatOptionalNumber(value, suffix) {
  return value === null ? 'Not available' : `${formatNumber(value)} ${suffix}`;
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
      ['Current daily budget', `${formatNumber(result.recommendation.currentTargetKcal)} kcal`],
      ['Suggested daily budget', `${formatNumber(result.recommendation.recommendedTargetKcal)} kcal`]
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
    change.textContent = formatBudgetChange(step);
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
    ['Observed pace', formatWeightInterval(result.estimates.observedWeeklyWeightChangeKg, result.weightUnit)],
    ['Estimated budget difference', formatBudgetInterval(result.estimates.targetAdjustmentKcal)]
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
  const safetyLimited = result.missingCriteria.some((criterion) => criterion.includes('safety floor'));
  elements.criteriaPanel.classList.toggle('satisfied', criteriaSatisfied);
  let criteriaTitle = 'What would strengthen this insight';
  if (criteriaSatisfied) criteriaTitle = 'Criteria satisfied';
  if (safetyLimited) criteriaTitle = 'Safety limit';
  if (result.nextStep) criteriaTitle = 'Next step';
  elements.criteriaTitle.textContent = criteriaTitle;
  elements.criteriaDescription.textContent = result.nextStep
    ? 'One clear action to keep building useful evidence.'
    : 'Requirements and uncertainty limits applied to this result.';
  elements.criteria.replaceChildren();
  if (criteriaSatisfied) {
    const copy = document.createElement('p');
    copy.className = 'criteria-copy';
    copy.textContent = 'This observation window meets all evidence criteria.';
    elements.criteria.append(copy);
  } else if (result.nextStep) {
    if (result.historyProgress) {
      const progress = document.createElement('div');
      progress.className = 'history-progress';
      const progressSummary = document.createElement('div');
      progressSummary.className = 'history-progress-summary';
      const progressLabel = document.createElement('strong');
      const progressValue = document.createElement('span');
      const progressText = `${result.historyProgress.observedDays} of ${result.historyProgress.requiredDays} days`;
      progressLabel.textContent = 'Progress toward first pace check';
      progressValue.textContent = progressText;
      progressSummary.append(progressLabel, progressValue);
      const progressTrack = document.createElement('div');
      progressTrack.className = 'history-progress-track';
      progressTrack.setAttribute('role', 'progressbar');
      progressTrack.setAttribute('aria-label', 'History for first pace check');
      progressTrack.setAttribute('aria-valuemin', '0');
      progressTrack.setAttribute('aria-valuemax', String(result.historyProgress.requiredDays));
      progressTrack.setAttribute('aria-valuenow', String(result.historyProgress.observedDays));
      progressTrack.setAttribute('aria-valuetext', progressText);
      const progressFill = document.createElement('span');
      progressFill.style.width = `${Math.min(100, Math.max(0, result.historyProgress.observedDays / result.historyProgress.requiredDays * 100))}%`;
      progressTrack.append(progressFill);
      progress.append(progressSummary, progressTrack);
      elements.criteria.append(progress);
    }
    const copy = document.createElement('p');
    copy.className = 'criteria-copy';
    copy.textContent = result.nextStep;
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
    span.textContent = `${result.activityContext.observedDays} days | ${formatOptionalNumber(result.activityContext.averageSteps, 'steps')} | ${formatOptionalNumber(result.activityContext.averageActiveCaloriesKcal, 'active kcal')}`;
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
