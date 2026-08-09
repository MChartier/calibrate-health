import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { registerClientDiagnosticReporter } from './clientDiagnostics';

/**
 * Keep diagnostics bound to the same confirmed server as the current auth context.
 * Bootstrap failures remain local because reporting to the hosted default could cross a self-host boundary.
 */
export function ClientDiagnosticsRuntime() {
    const { api } = useAuth();

    useEffect(() => registerClientDiagnosticReporter((input) => api.reportClientDiagnostic(input)), [api]);

    return null;
}
