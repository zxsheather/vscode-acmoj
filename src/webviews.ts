// src/webviews.ts
import * as vscode from 'vscode';
import { ApiClient } from './api';
import { Problem, Submission } from './types';

// 存储当前打开的 Webview Panel，避免重复创建
const problemPanels: Map<number, vscode.WebviewPanel> = new Map();
const submissionPanels: Map<number, vscode.WebviewPanel> = new Map();

/**
 * @brief show a Webview Panel with details of a problem
 * @param problemId the ID of the problem
 * @param apiClient the API client to fetch problem details
 * @param context the extension context
 */
export async function showProblemDetails(problemId: number, apiClient: ApiClient, context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (problemPanels.has(problemId)) {
        problemPanels.get(problemId)?.reveal(column);
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'acmojProblem',
        `Problem ${problemId}`,
        column || vscode.ViewColumn.One,
        {
            enableScripts: true, // allow JavaScript
            // localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'resources')] // if loading local resources
        }
    );
    problemPanels.set(problemId, panel);

    panel.webview.html = getWebviewContent("Loading problem...", panel.webview, context.extensionUri);

    try {
        const problem = await apiClient.getProblemDetails(problemId);
        panel.title = `Problem ${problem.id}: ${problem.title}`;
        panel.webview.html = getProblemHtml(problem, panel.webview, context.extensionUri);

        // handle messages (e.g. clicking "Submit")
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'submit':
                        vscode.commands.executeCommand('acmoj.submitCurrentFile', problem.id);
                        return;
                }
            },
            undefined,
            context.subscriptions
        );

    } catch (error: any) {
        panel.webview.html = getWebviewContent(`Error loading problem ${problemId}: ${error.message}`, panel.webview, context.extensionUri);
        vscode.window.showErrorMessage(`Failed to load problem ${problemId}: ${error.message}`);
    }

    panel.onDidDispose(() => {
        problemPanels.delete(problemId);
    }, null, context.subscriptions);
}

export async function showSubmissionDetails(submissionId: number, apiClient: ApiClient, context: vscode.ExtensionContext) {
     const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (submissionPanels.has(submissionId)) {
        submissionPanels.get(submissionId)?.reveal(column);
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'acmojSubmission',
        `Submission ${submissionId}`,
        column || vscode.ViewColumn.One,
        {
            enableScripts: true,
            // localResourceRoots: [...]
        }
    );
    submissionPanels.set(submissionId, panel);

    panel.webview.html = getWebviewContent("Loading submission...", panel.webview, context.extensionUri);

    try {
        const submission = await apiClient.getSubmissionDetails(submissionId);
        let codeContent = submission.code_url ? 'Loading code...' : 'Code not available or permission denied.';
        panel.webview.html = getSubmissionHtml(submission, codeContent, panel.webview, context.extensionUri);

        if (submission.code_url) {
            try {
                codeContent = await apiClient.getSubmissionCode(submission.code_url);
                 panel.webview.html = getSubmissionHtml(submission, escapeHtml(codeContent), panel.webview, context.extensionUri);
            } catch (codeError: any) {
                 panel.webview.html = getSubmissionHtml(submission, `Error loading code: ${codeError.message}`, panel.webview, context.extensionUri);
            }
        }

         // handle messages (e.g. clicking "Abort")
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'abort':
                        if (submission.abort_url) {
                             vscode.commands.executeCommand('acmoj.abortSubmission', submission.id);
                        }
                        return;
                }
            },
            undefined,
            context.subscriptions
        );

    } catch (error: any) {
        panel.webview.html = getWebviewContent(`Error loading submission ${submissionId}: ${error.message}`, panel.webview, context.extensionUri);
        vscode.window.showErrorMessage(`Failed to load submission ${submissionId}: ${error.message}`);
    }

    panel.onDidDispose(() => {
        submissionPanels.delete(submissionId);
    }, null, context.subscriptions);
}


// --- HTML Generation ---

function getWebviewContent(content: string, webview: vscode.Webview, extensionUri: vscode.Uri): string {
    // TODO: Add nonce for security
    // const nonce = getNonce();
    // const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'webview.css'));
    // const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'webview.js'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ACMOJ</title>
    <style>
        body { padding: 1em; }
        pre { background-color: var(--vscode-textCodeBlock-background); padding: 0.5em; border-radius: 3px; }
        .section { margin-bottom: 1.5em; }
        h2 { border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder); padding-bottom: 0.3em; }
        .label { font-weight: bold; min-width: 100px; display: inline-block;}
        .status-accepted { color: var(--vscode-testing-iconPassed); }
        .status-error { color: var(--vscode-testing-iconFailed); }
        /* Add more status colors */
    </style>
</head>
<body>
    ${content}
</body>
</html>`;
}

function getProblemHtml(problem: Problem, webview: vscode.Webview, extensionUri: vscode.Uri): string {
    let examplesHtml = '';
    if (problem.examples && problem.examples.length > 0) {
        examplesHtml = problem.examples.map((ex, i) => `
            <h4>Example ${ex.name || (i + 1)}</h4>
            ${ex.description ? `<p>${escapeHtml(ex.description)}</p>` : ''}
            ${ex.input ? `<h5>Input:</h5><pre><code>${escapeHtml(ex.input)}</code></pre>` : ''}
            ${ex.output ? `<h5>Output:</h5><pre><code>${escapeHtml(ex.output)}</code></pre>` : ''}
        `).join('');
    } else if (problem.example_input || problem.example_output) { // old version example
         examplesHtml = `
            <h4>Example</h4>
            ${problem.example_input ? `<h5>Input:</h5><pre><code>${escapeHtml(problem.example_input)}</code></pre>` : ''}
            ${problem.example_output ? `<h5>Output:</h5><pre><code>${escapeHtml(problem.example_output)}</code></pre>` : ''}
        `;
    }

    const content = `
        <h1>${problem.id}: ${escapeHtml(problem.title)}</h1>
        <button id="submit-button">Submit Code for this Problem</button>

        <div class="section">
            <h2>Description</h2>
            <div>${problem.description ? renderContent(problem.description) : 'N/A'}</div>
        </div>

        <div class="section">
            <h2>Input Format</h2>
            <div>${problem.input ? renderContent(problem.input) : 'N/A'}</div>
        </div>

        <div class="section">
            <h2>Output Format</h2>
            <div>${problem.output ? renderContent(problem.output) : 'N/A'}</div>
        </div>

        <div class="section">
            <h2>Examples</h2>
            ${examplesHtml || 'N/A'}
        </div>

         <div class="section">
            <h2>Data Range</h2>
            <div>${problem.data_range ? renderContent(problem.data_range) : 'N/A'}</div>
        </div>

         <div class="section">
            <h2>Accepted Languages</h2>
            <div>${problem.languages_accepted ? problem.languages_accepted.join(', ') : 'N/A'}</div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            document.getElementById('submit-button').addEventListener('click', () => {
                vscode.postMessage({ command: 'submit' });
            });
        </script>
    `;
    return getWebviewContent(content, webview, extensionUri);
}

function getSubmissionHtml(submission: Submission, codeContent: string, webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const statusClass = `status-${submission.status.toLowerCase().replace(/_/g, '-')}`;
    const abortButtonHtml = submission.abort_url
        ? `<button id="abort-button">Abort Submission</button>`
        : '';

    const content = `
        <h1>Submission #${submission.id}</h1>
        ${abortButtonHtml}

        <div class="section">
            <h2>Details</h2>
            <p><span class="label">Problem:</span> ${submission.problem?.id}: ${escapeHtml(submission.problem?.title || '?')}</p>
            <p><span class="label">User:</span> ${escapeHtml(submission.friendly_name)}</p>
            <p><span class="label">Status:</span> <strong class="${statusClass}">${submission.status}</strong></p>
            ${submission.should_show_score && submission.score !== null ? `<p><span class="label">Score:</span> ${submission.score}</p>` : ''}
            <p><span class="label">Language:</span> ${submission.language}</p>
            <p><span class="label">Time:</span> ${submission.time_msecs !== null ? `${submission.time_msecs} ms` : 'N/A'}</p>
            <p><span class="label">Memory:</span> ${submission.memory_bytes !== null ? `${(submission.memory_bytes / 1024 / 1024).toFixed(2)} MB` : 'N/A'}</p>
            <p><span class="label">Submitted At:</span> ${new Date(submission.created_at).toLocaleString()}</p>
            ${submission.message ? `<p><span class="label">Message:</span> ${escapeHtml(submission.message)}</p>` : ''}
        </div>

        ${submission.details ? `
        <div class="section">
            <h2>Judge Details</h2>
            <pre><code>${escapeHtml(JSON.stringify(submission.details, null, 2))}</code></pre>
        </div>
        ` : ''}


        <div class="section">
            <h2>Code</h2>
            <pre><code>${codeContent}</code></pre>
        </div>

        ${abortButtonHtml ? `
        <script>
            const vscode = acquireVsCodeApi();
            document.getElementById('abort-button').addEventListener('click', () => {
                vscode.postMessage({ command: 'abort' });
            });
        </script>
        ` : ''}
    `;
     return getWebviewContent(content, webview, extensionUri);
}

// simple HTML escaping
function escapeHtml(unsafe: string | null | undefined): string {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// simple rendering of content with line breaks
// TODO: Use a proper Markdown parser for more complex formatting
function renderContent(content: string): string {
    // escape HTML and replace newlines with <br>
    return escapeHtml(content).replace(/\n/g, '<br>');
}
