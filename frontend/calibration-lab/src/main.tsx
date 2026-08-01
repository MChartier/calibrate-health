import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
    evaluateCalibration,
    type CalibrationInput,
    type CalibrationInterval,
    type CalibrationResult
} from '../../../shared/calibration';
import { CALIBRATION_SCENARIOS } from '../../../shared/calibrationScenarios';
import './styles.css';

const CUSTOM_SCENARIO_ID = 'custom';
const formatJson = (value: unknown): string => JSON.stringify(value, null, 2);

function getInitialScenario() {
    const requestedId = new URLSearchParams(window.location.search).get('scenario');
    return CALIBRATION_SCENARIOS.find((scenario) => scenario.id === requestedId) ?? CALIBRATION_SCENARIOS[0];
}

function updateScenarioUrl(scenarioId: string | null) {
    const url = new URL(window.location.href);
    if (scenarioId) url.searchParams.set('scenario', scenarioId);
    else url.searchParams.delete('scenario');
    window.history.replaceState(null, '', url);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
    return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
    return value;
}

function parseCalibrationInput(text: string): CalibrationInput {
    const parsed = requireRecord(JSON.parse(text), 'History input');
    const foodDays = parsed.foodDays;
    const weightPoints = parsed.weightPoints;
    if (!Array.isArray(foodDays)) throw new Error('foodDays must be an array.');
    if (!Array.isArray(weightPoints)) throw new Error('weightPoints must be an array.');

    foodDays.forEach((value, index) => {
        const day = requireRecord(value, `foodDays[${index}]`);
        requireString(day.date, `foodDays[${index}].date`);
        requireFiniteNumber(day.calories, `foodDays[${index}].calories`);
        requireFiniteNumber(day.entryCount, `foodDays[${index}].entryCount`);
        requireFiniteNumber(day.mealPeriodCount, `foodDays[${index}].mealPeriodCount`);
        if (typeof day.isComplete !== 'boolean') throw new Error(`foodDays[${index}].isComplete must be a boolean.`);
    });
    weightPoints.forEach((value, index) => {
        const point = requireRecord(value, `weightPoints[${index}]`);
        requireString(point.date, `weightPoints[${index}].date`);
        requireFiniteNumber(point.trendWeightKg, `weightPoints[${index}].trendWeightKg`);
        const lower = requireFiniteNumber(point.lowerKg, `weightPoints[${index}].lowerKg`);
        const upper = requireFiniteNumber(point.upperKg, `weightPoints[${index}].upperKg`);
        if (lower > upper) throw new Error(`weightPoints[${index}] lowerKg cannot exceed upperKg.`);
    });

    if (parsed.activityDays !== undefined) {
        if (!Array.isArray(parsed.activityDays)) throw new Error('activityDays must be an array when provided.');
        parsed.activityDays.forEach((value, index) => {
            const day = requireRecord(value, `activityDays[${index}]`);
            requireString(day.date, `activityDays[${index}].date`);
            if (day.steps !== undefined && day.steps !== null) requireFiniteNumber(day.steps, `activityDays[${index}].steps`);
            if (day.activeCaloriesKcal !== undefined && day.activeCaloriesKcal !== null) {
                requireFiniteNumber(day.activeCaloriesKcal, `activityDays[${index}].activeCaloriesKcal`);
            }
        });
    }

    requireString(parsed.asOfDate, 'asOfDate');
    requireFiniteNumber(parsed.ageYears, 'ageYears');
    requireFiniteNumber(parsed.bmrKcal, 'bmrKcal');
    requireFiniteNumber(parsed.profileTdeeKcal, 'profileTdeeKcal');
    requireFiniteNumber(parsed.configuredDailyDeficitKcal, 'configuredDailyDeficitKcal');
    requireFiniteNumber(parsed.currentTargetAdjustmentKcal, 'currentTargetAdjustmentKcal');
    return parsed as CalibrationInput;
}

function formatInterval(value: CalibrationInterval | null, options: { unit: string; precision?: number }): string {
    if (!value) return 'Not enough evidence';
    const precision = options.precision ?? 0;
    const format = (number: number) => number.toLocaleString(undefined, {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision
    });
    return `${format(value.midpoint)} ${options.unit} (${format(value.low)} to ${format(value.high)})`;
}

export function Metric(props: { label: string; value: React.ReactNode }) {
    return <div className="metric"><strong>{props.value}</strong><span>{props.label}</span></div>;
}

function Estimate(props: { label: string; value: string }) {
    return <div className="estimate"><span>{props.label}</span><strong>{props.value}</strong></div>;
}

export function Lab() {
    const initial = getInitialScenario();
    const [scenarioId, setScenarioId] = useState(initial.id);
    const [inputText, setInputText] = useState(formatJson(initial.input));
    const [inputError, setInputError] = useState<string | null>(null);
    const [result, setResult] = useState<CalibrationResult>(() => evaluateCalibration(initial.input));
    const selectedScenario = CALIBRATION_SCENARIOS.find((scenario) => scenario.id === scenarioId);

    function chooseScenario(nextId: string) {
        const scenario = CALIBRATION_SCENARIOS.find((candidate) => candidate.id === nextId);
        if (!scenario) return;
        setScenarioId(nextId);
        setInputText(formatJson(scenario.input));
        setResult(evaluateCalibration(scenario.input));
        setInputError(null);
        updateScenarioUrl(nextId);
    }

    function editInput(nextText: string) {
        setInputText(nextText);
        setScenarioId(CUSTOM_SCENARIO_ID);
        updateScenarioUrl(null);
    }

    function evaluateEditedHistory() {
        try {
            const parsed = parseCalibrationInput(inputText);
            setResult(evaluateCalibration(parsed));
            setInputError(null);
        } catch (error) {
            setInputError(error instanceof Error ? error.message : 'Invalid calibration history.');
        }
    }

    const uncertainDays = result.dataQuality.missingDays + result.dataQuality.incompleteDays + result.dataQuality.suspiciousDays;
    const recommendation = result.recommendation;

    return (
        <main>
            <header>
                <div>
                    <span className="eyebrow">Development tool</span>
                    <h1>Calibration history lab</h1>
                    <p>Explore deterministic food, weight, uncertainty, and recommendation states without waiting weeks for real history.</p>
                </div>
                <div className="scenario-control">
                    <label htmlFor="preset-history">Preset history</label>
                    <select id="preset-history" value={scenarioId} onChange={(event) => chooseScenario(event.target.value)}>
                        {scenarioId === CUSTOM_SCENARIO_ID && <option value={CUSTOM_SCENARIO_ID}>Custom edited history</option>}
                        {CALIBRATION_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
                    </select>
                    <span className="scenario-description">
                        {selectedScenario?.description ?? 'Custom JSON input. Select a preset to restore a known history.'}
                    </span>
                </div>
            </header>

            <section className={`outcome ${result.status}`}>
                <div className="outcome-copy">
                    <span className="status">{result.status.replace('_', ' ')}</span>
                    <h2>{result.headline}</h2>
                    <p>{result.summary}</p>
                    {recommendation && (
                        <div className="target-change" aria-label="Recommended calorie target change">
                            <span><small>Current target</small><strong>{recommendation.currentTargetKcal.toLocaleString()} kcal</strong></span>
                            <b aria-hidden="true">to</b>
                            <span><small>Suggested target</small><strong>{recommendation.recommendedTargetKcal.toLocaleString()} kcal</strong></span>
                            <em>{recommendation.adjustmentStepKcal > 0 ? '+' : ''}{recommendation.adjustmentStepKcal} kcal</em>
                        </div>
                    )}
                </div>
                <div className="metrics">
                    <Metric label="window" value={result.selectedWindowDays ? `${result.selectedWindowDays} days` : '-'} />
                    <Metric label="confident days" value={result.dataQuality.confidentDays} />
                    <Metric label="uncertain days" value={uncertainDays} />
                    <Metric label="weight span" value={`${result.dataQuality.weightSpanDays} days`} />
                </div>
            </section>

            <section className="evidence-grid">
                <article className="panel evidence-panel">
                    <div className="panel-heading compact"><div><h2>Evidence summary</h2><p>Median estimate with the modeled 95% interval.</p></div></div>
                    <div className="estimate-grid">
                        <Estimate label="Average intake" value={formatInterval(result.estimates.averageIntakeKcal, { unit: 'kcal/day' })} />
                        <Estimate label="Observed pace" value={formatInterval(result.estimates.observedWeeklyWeightChangeKg, { unit: 'kg/week', precision: 2 })} />
                        <Estimate label="Inferred TDEE" value={formatInterval(result.estimates.inferredTdeeKcal, { unit: 'kcal/day' })} />
                        <Estimate label="Target correction" value={formatInterval(result.estimates.targetAdjustmentKcal, { unit: 'kcal/day' })} />
                    </div>
                </article>
                <article className={`panel criteria-panel ${result.missingCriteria.length === 0 ? 'satisfied' : ''}`}>
                    <div className="panel-heading compact">
                        <div><h2>{result.missingCriteria.length === 0 ? 'Criteria satisfied' : 'Why no stronger action'}</h2><p>Requirements and uncertainty limits applied to this result.</p></div>
                    </div>
                    {result.missingCriteria.length === 0 ? (
                        <p className="criteria-copy">No missing evidence criteria for this observation window.</p>
                    ) : (
                        <ul>{result.missingCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
                    )}
                    {result.activityContext && (
                        <div className="activity-context">
                            <strong>Activity context only</strong>
                            <span>{result.activityContext.observedDays} days | {result.activityContext.averageSteps?.toLocaleString() ?? '-'} steps | {result.activityContext.averageActiveCaloriesKcal?.toLocaleString() ?? '-'} active kcal</span>
                        </div>
                    )}
                </article>
            </section>

            <section className="workspace">
                <div className="panel editor">
                    <div className="panel-heading">
                        <div><h2>History input</h2><p>Edit any preset directly. The lab sends nothing to the service.</p></div>
                        <button type="button" onClick={evaluateEditedHistory}>Evaluate</button>
                    </div>
                    {inputError && <div className="error" role="alert">{inputError}</div>}
                    <textarea value={inputText} onChange={(event) => editInput(event.target.value)} spellCheck={false} />
                </div>

                <div className="panel result">
                    <div className="panel-heading">
                        <div><h2>Evaluator output</h2><p>Full wire-shaped result, including intervals and missing criteria.</p></div>
                    </div>
                    <pre>{formatJson(result)}</pre>
                </div>
            </section>
        </main>
    );
}

const rootContainer = document.getElementById('root') as HTMLElement & {
    calibrationLabRoot?: ReturnType<typeof createRoot>;
};
const root = rootContainer.calibrationLabRoot ?? createRoot(rootContainer);
rootContainer.calibrationLabRoot = root;
root.render(<React.StrictMode><Lab /></React.StrictMode>);
