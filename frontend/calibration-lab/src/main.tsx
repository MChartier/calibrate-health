import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { evaluateCalibration, type CalibrationInput } from '../../../shared/calibration';
import { CALIBRATION_SCENARIOS } from '../../../shared/calibrationScenarios';
import './styles.css';

const formatJson = (value: unknown): string => JSON.stringify(value, null, 2);

export function Metric(props: { label: string; value: React.ReactNode }) {
    return <div className="metric"><strong>{props.value}</strong><span>{props.label}</span></div>;
}

export function Lab() {
    const initial = CALIBRATION_SCENARIOS[0];
    const [scenarioId, setScenarioId] = useState(initial.id);
    const [inputText, setInputText] = useState(formatJson(initial.input));
    const [parseError, setParseError] = useState<string | null>(null);
    const [input, setInput] = useState<CalibrationInput>(initial.input);
    const result = useMemo(() => evaluateCalibration(input), [input]);

    function chooseScenario(nextId: string) {
        const scenario = CALIBRATION_SCENARIOS.find((candidate) => candidate.id === nextId);
        if (!scenario) return;
        setScenarioId(nextId);
        setInputText(formatJson(scenario.input));
        setInput(scenario.input);
        setParseError(null);
    }

    function evaluateEditedHistory() {
        try {
            setInput(JSON.parse(inputText) as CalibrationInput);
            setParseError(null);
        } catch (error) {
            setParseError(error instanceof Error ? error.message : 'Invalid JSON');
        }
    }

    return (
        <main>
            <header>
                <div>
                    <span className="eyebrow">Development tool</span>
                    <h1>Calibration history lab</h1>
                    <p>Explore deterministic food, weight, uncertainty, and recommendation states without waiting weeks for real history.</p>
                </div>
                <label>
                    Preset history
                    <select value={scenarioId} onChange={(event) => chooseScenario(event.target.value)}>
                        {CALIBRATION_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
                    </select>
                </label>
            </header>

            <section className={`outcome ${result.status}`}>
                <div>
                    <span className="status">{result.status.replace('_', ' ')}</span>
                    <h2>{result.headline}</h2>
                    <p>{result.summary}</p>
                </div>
                <div className="metrics">
                    <Metric label="window" value={result.selectedWindowDays ? `${result.selectedWindowDays} days` : '-'} />
                    <Metric label="confident days" value={result.dataQuality.confidentDays} />
                    <Metric label="uncertain days" value={result.dataQuality.missingDays + result.dataQuality.incompleteDays + result.dataQuality.suspiciousDays} />
                    <Metric label="weight span" value={`${result.dataQuality.weightSpanDays} days`} />
                </div>
            </section>

            <section className="workspace">
                <div className="panel editor">
                    <div className="panel-heading">
                        <div><h2>History input</h2><p>Edit any preset directly. The lab sends nothing to the service.</p></div>
                        <button type="button" onClick={evaluateEditedHistory}>Evaluate</button>
                    </div>
                    {parseError && <div className="error">{parseError}</div>}
                    <textarea value={inputText} onChange={(event) => setInputText(event.target.value)} spellCheck={false} />
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

createRoot(document.getElementById('root')!).render(<React.StrictMode><Lab /></React.StrictMode>);
