import * as vscode from "vscode";
import { ApiClient } from "./api";
import { Problem, Submission } from "./types";
import MarkdownIt from "markdown-it";
import katexPlugin from '@vscode/markdown-it-katex';

const problemPanels: Map<number, vscode.WebviewPanel> = new Map();
const submissionPanels: Map<number, vscode.WebviewPanel> = new Map();
const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true,
})
.use(katexPlugin);

/**
 * @brief show a Webview Panel with details of a problem
 * @param problemId the ID of the problem
 * @param apiClient the API client to fetch problem details
 * @param context the extension context
 */
export async function showProblemDetails(
  problemId: number,
  apiClient: ApiClient,
  context: vscode.ExtensionContext
) {
  const column = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined;

  if (problemPanels.has(problemId)) {
    problemPanels.get(problemId)?.reveal(column);
    return;
  }

  // Define the path to the KaTeX distribution
  const katexDistPath = vscode.Uri.joinPath(
    context.extensionUri,
    "node_modules",
    "katex",
    "dist"
  );

  const panel = vscode.window.createWebviewPanel(
    "acmojProblem",
    `Problem ${problemId}`,
    column || vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [katexDistPath],
    }
  );
  problemPanels.set(problemId, panel);

  // Set initial loading HTML
  panel.webview.html = getWebviewContent(
    "Loading problem...",
    panel.webview,
    context.extensionUri
  );

  try {
    const problem = await apiClient.getProblemDetails(problemId);
    panel.title = `Problem ${problem.id}: ${problem.title}`;
    panel.webview.html = getProblemHtml(
      problem,
      panel.webview,
      context.extensionUri
    );

    panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "submit":
            vscode.commands.executeCommand("acmoj.submitCurrentFile", {
              problemId: message.problemId,
            });
            return;
        }
      },
      undefined,
      context.subscriptions
    );
  } catch (error: any) {
    panel.webview.html = getWebviewContent(
      `Error loading problem ${problemId}: ${error.message}`,
      panel.webview,
      context.extensionUri
    );
    vscode.window.showErrorMessage(
      `Failed to load problem ${problemId}: ${error.message}`
    );
  }

  panel.onDidDispose(
    () => {
      problemPanels.delete(problemId);
    },
    null,
    context.subscriptions
  );
}

/**
 * @brief show a Webview Panel with details of a submission
 * @param submissionId the ID of the submission
 * @param apiClient the API client to fetch submission details
 * @param context the extension context
 */
export async function showSubmissionDetails(
  submissionId: number,
  apiClient: ApiClient,
  context: vscode.ExtensionContext
) {
  const column = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined;

  if (submissionPanels.has(submissionId)) {
    submissionPanels.get(submissionId)?.reveal(column);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "acmojSubmission",
    `Submission ${submissionId}`,
    column || vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(
            context.extensionUri,
            "node_modules",
            "katex",
            "dist"
            ),
        ]
    }
  );
  submissionPanels.set(submissionId, panel);

  panel.webview.html = getWebviewContent(
    "Loading submission...",
    panel.webview,
    context.extensionUri
  );

  try {
    const submission = await apiClient.getSubmissionDetails(submissionId);
    let codeContent = submission.code_url
      ? "Loading code..."
      : "Code not available or permission denied.";
    panel.webview.html = getSubmissionHtml(
      submission,
      codeContent,
      panel.webview,
      context.extensionUri
    );

    if (submission.code_url) {
      try {
        codeContent = await apiClient.getSubmissionCode(submission.code_url);
        panel.webview.html = getSubmissionHtml(
          submission,
          escapeHtml(codeContent),
          panel.webview,
          context.extensionUri
        );
      } catch (codeError: any) {
        panel.webview.html = getSubmissionHtml(
          submission,
          `Error loading code: ${codeError.message}`,
          panel.webview,
          context.extensionUri
        );
      }
    }

    // handle messages (e.g. clicking "Abort")
    panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "abort":
            if (submission.abort_url) {
              vscode.commands.executeCommand(
                "acmoj.abortSubmission",
                submission.id
              );
            }
            return;
        }
      },
      undefined,
      context.subscriptions
    );
  } catch (error: any) {
    panel.webview.html = getWebviewContent(
      `Error loading submission ${submissionId}: ${error.message}`,
      panel.webview,
      context.extensionUri
    );
    vscode.window.showErrorMessage(
      `Failed to load submission ${submissionId}: ${error.message}`
    );
  }

  panel.onDidDispose(
    () => {
      submissionPanels.delete(submissionId);
    },
    null,
    context.subscriptions
  );
}

// --- HTML Generation ---

/**
 * Generates the base HTML structure, now including KaTeX assets and auto-render script.
 */
function getWebviewContent(
  content: string,
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const nonce = getNonce();
  const cspSource = webview.cspSource;

  // --- Get URIs for KaTeX assets ---
  const katexDistUri = vscode.Uri.joinPath(
    extensionUri,
    "node_modules",
    "katex",
    "dist"
  );
  const katexCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(katexDistUri, "katex.min.css")
  );
  const katexFontsUri = webview.asWebviewUri(vscode.Uri.joinPath(katexDistUri, 'fonts'));

  // console.log("KaTeX CSS URI:", katexCssUri.toString());
  // console.log("KaTeX Fonts Directory URI:", katexFontsUri.toString());

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    
    <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    font-src ${webview.cspSource};
    img-src ${webview.cspSource} https: data:;
    script-src 'nonce-${nonce}';
    ">

    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- KaTeX CSS -->
    <link rel="stylesheet" href="${katexCssUri}">

    <title>ACMOJ</title>
    <style nonce="${nonce}">
        /* Basic Reset & Body */
        body {
            font-family: var(--vscode-font-family, Arial, sans-serif);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 1em 2em;
            line-height: 1.6;
        }
        /* Headings */
        h1, h2, h3, h4, h5, h6 {
            margin-top: 1.2em;
            margin-bottom: 0.6em;
            font-weight: 600;
            color: var(--vscode-textLink-foreground); /* Make headings stand out a bit */
        }
        h1 { font-size: 1.8em; border-bottom: 1px solid var(--vscode-editorWidget-border, #ccc); padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid var(--vscode-editorWidget-border, #ccc); padding-bottom: 0.3em; }
        h3 { font-size: 1.3em; }
        h4 { font-size: 1.1em; }

        /* Paragraphs and Links */
        p { margin-bottom: 1em; }
        a { color: var(--vscode-textLink-foreground); text-decoration: none; }
        a:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
        a:focus { outline: 1px solid var(--vscode-focusBorder); }

        /* Code Blocks and Inline Code */
        pre, code {
            font-family: var(--vscode-editor-font-family, Consolas, 'Courier New', monospace);
            font-size: 0.95em;
        }
        code { /* Inline code */
            background-color: var(--vscode-textCodeBlock-background);
            padding: 0.2em 0.4em;
            border-radius: 3px;
        }
        pre { /* Code block */
            background-color: var(--vscode-textCodeBlock-background);
            padding: 1em;
            border-radius: 4px;
            overflow-x: auto; /* Allow horizontal scrolling for long lines */
            margin-bottom: 1em;
        }
        pre code { /* Reset styles for code inside pre */
            background-color: transparent;
            padding: 0;
            border-radius: 0;
        }

        /* Lists */
        ul, ol { padding-left: 2em; margin-bottom: 1em; }
        li { margin-bottom: 0.4em; }

        /* Blockquotes */
        blockquote {
            margin: 1em 0;
            padding: 0.5em 1em;
            border-left: 0.25em solid var(--vscode-editorWidget-border, #ccc);
            background-color: var(--vscode-textBlockQuote-background);
            color: var(--vscode-textBlockQuote-foreground);
        }
        blockquote p { margin-bottom: 0.5em; }

        /* Tables (Basic Styling) */
        table {
            border-collapse: collapse;
            margin: 1em 0;
            width: auto;
            border: 1px solid var(--vscode-editorWidget-border, #ccc);
        }
        th, td {
            border: 1px solid var(--vscode-editorWidget-border, #ccc);
            padding: 0.5em 0.8em;
            text-align: left;
        }
        th {
            background-color: var(--vscode-toolbar-hoverBackground);
            font-weight: 600;
        }
        thead {
             border-bottom: 2px solid var(--vscode-editorWidget-border, #ccc);
        }

        /* Other Styles */
        .section { margin-bottom: 2em; }
        .label { font-weight: bold; min-width: 100px; display: inline-block;}
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border, transparent);
            padding: 0.5em 1em;
            border-radius: 2px;
            cursor: pointer;
            margin-right: 0.5em;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        /* Status colors */
        .status-accepted { color: var(--vscode-testing-iconPassed); }
        .status-error { color: var(--vscode-testing-iconFailed); }
        
        /* KaTeX specific styles */
        .katex {
             font-size: 1.2em; /* Slightly larger math font */
        }
        .katex-display {
             margin: 1em 0;
             text-align: center;
        }

    </style>
</head>
<body>
    ${content}
</body>
</html>`;
}

/**
 * Generates the HTML content for the problem details webview, using Markdown rendering.
 */
function getProblemHtml(
    problem: Problem,
    webview: vscode.Webview,
    extensionUri: vscode.Uri
  ): string {
    const descriptionHtml = md.render(
    problem.description || "*No description provided.*"
    );
    const inputHtml = md.render(problem.input || "*No input format specified.*");
    const outputHtml = md.render(
      problem.output || "*No output format specified.*"
    );
    const dataRangeHtml = md.render(
      problem.data_range || "*No data range specified.*"
    );
  
    let examplesHtml = "";
    if (problem.examples && problem.examples.length > 0) {
      examplesHtml = problem.examples
        .map(
          (ex, i) => `
              <h4>Example ${escapeHtml(ex.name) || i + 1}</h4>
              ${ex.description ? `<p>${escapeHtml(ex.description)}</p>` : ""}
              ${
                ex.input !== undefined && ex.input !== null
                  ? `<h5>Input:</h5><pre><code>${escapeHtml(
                      ex.input
                    )}</code></pre>`
                  : ""
              }
              ${
                ex.output !== undefined && ex.output !== null
                  ? `<h5>Output:</h5><pre><code>${escapeHtml(
                      ex.output
                    )}</code></pre>`
                  : ""
              }
          `
        )
        .join("");
    } else if (problem.example_input || problem.example_output) {
      // Legacy examples
      examplesHtml = `
              <h4>Example</h4>
              ${
                problem.example_input
                  ? `<h5>Input:</h5><pre><code>${escapeHtml(
                      problem.example_input
                    )}</code></pre>`
                  : ""
              }
              ${
                problem.example_output
                  ? `<h5>Output:</h5><pre><code>${escapeHtml(
                      problem.example_output
                    )}</code></pre>`
                  : ""
              }
          `;
    }
  
  
    // Construct the main content
    const content = `
          <h1>${problem.id}: ${escapeHtml(problem.title)}</h1>
          <!--<button id="submit-button">Submit Code for this Problem</button>-->
  
          <div class="section">
              <h2>Description</h2>
              <div>${descriptionHtml}</div>
          </div>
  
          <div class="section">
              <h2>Input Format</h2>
              <div>${inputHtml}</div>
          </div>
  
          <div class="section">
              <h2>Output Format</h2>
              <div>${outputHtml}</div>
          </div>
  
          <div class="section">
              <h2>Examples</h2>
              ${examplesHtml || "*No examples provided.*"}
          </div>
  
           <div class="section">
              <h2>Data Range</h2>
              <div>${dataRangeHtml}</div>
          </div>
  
           <div class="section">
              <h2>Accepted Languages</h2>
              <div>${
                problem.languages_accepted
                  ? escapeHtml(problem.languages_accepted.join(", "))
                  : "N/A"
              }</div>
          </div>
  
          <script nonce="${getNonce()}">
              // Add button listener script here
              const vscode = acquireVsCodeApi();
              const submitButton = document.getElementById('submit-button');
              if (submitButton) {
                  submitButton.addEventListener('click', () => {
                      vscode.postMessage({ command: 'submit', problemId: ${
                      problem.id
                      } });
                  });
            }
          </script>
      `;
    return getWebviewContent(content, webview, extensionUri);
  }

/**
 * Generates the HTML content for the submission details webview.
 * (No Markdown rendering needed here unless submission details/messages use it)
 */
function getSubmissionHtml(
  submission: Submission,
  codeContent: string,
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const statusClass = `status-${submission.status
    .toLowerCase()
    .replace(/_/g, "-")}`;
  const abortButtonHtml = submission.abort_url
    ? `<button id="abort-button">Abort Submission</button>`
    : "";

  // Escape potentially unsafe content from the API
  const messageHtml = submission.message
    ? `<p><span class="label">Message:</span> ${escapeHtml(
        submission.message
      )}</p>`
    : "";
  const detailsHtml = submission.details
    ? `
        <div class="section">
            <h2>Judge Details</h2>
            <pre><code>${escapeHtml(
              JSON.stringify(submission.details, null, 2)
            )}</code></pre>
        </div>
    `
    : "";
  const problemTitleHtml = escapeHtml(submission.problem?.title || "?");
  const friendlyNameHtml = escapeHtml(submission.friendly_name);
  const codeHtml = escapeHtml(codeContent); // Escape the fetched code

  const content = `
        <h1>Submission #${submission.id}</h1>
        ${abortButtonHtml}

        <div class="section">
            <h2>Details</h2>
            <p><span class="label">Problem:</span> ${
              submission.problem?.id
            }: ${problemTitleHtml}</p>
            <p><span class="label">User:</span> ${friendlyNameHtml}</p>
            <p><span class="label">Status:</span> <strong class="${statusClass}">${
    submission.status
  }</strong></p>
            ${
              submission.should_show_score && submission.score !== null
                ? `<p><span class="label">Score:</span> ${submission.score}</p>`
                : ""
            }
            <p><span class="label">Language:</span> ${submission.language}</p>
            <p><span class="label">Time:</span> ${
              submission.time_msecs !== null
                ? `${submission.time_msecs} ms`
                : "N/A"
            }</p>
            <p><span class="label">Memory:</span> ${
              submission.memory_bytes !== null
                ? `${(submission.memory_bytes / 1024 / 1024).toFixed(2)} MB`
                : "N/A"
            }</p>
            <p><span class="label">Submitted At:</span> ${new Date(
              submission.created_at
            ).toLocaleString()}</p>
            ${messageHtml}
        </div>

        ${detailsHtml}

        <div class="section">
            <h2>Code</h2>
            <pre><code>${codeHtml}</code></pre>
        </div>

        ${
          abortButtonHtml
            ? `
        <script nonce="${getNonce()}">
            const vscode = acquireVsCodeApi();
            document.getElementById('abort-button').addEventListener('click', () => {
                vscode.postMessage({ command: 'abort', submissionId: ${
                  submission.id
                } }); // Pass submissionId back
            });
        </script>
        `
            : ""
        }
    `;
  return getWebviewContent(content, webview, extensionUri);
}

// simple HTML escaping
function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe === null || unsafe === undefined) return "";
  return unsafe
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// simple rendering of content with line breaks
function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
