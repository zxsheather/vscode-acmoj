# Changelog

All notable changes to the "vscode-acmoj" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

*   **Initial Release Features:**
    *   Authentication using ACMOJ Personal Access Token (PAT).
    *   Command `ACMOJ: Set Personal Access Token` to securely store the token.
    *   Command `ACMOJ: Clear Personal Access Token` to remove the stored token.
    *   Status bar item displaying login status and logged-in user's friendly name/username.
    *   Command `ACMOJ: Show My Profile` accessible via status bar click (when logged in) or command palette.
    *   Activity Bar container with "ACMOJ" icon.
    *   Tree View: "Problemsets" - Lists contests and homework the user has joined.
        *   Expandable problemsets to show included problems.
        *   Clicking a problem opens its details in a Webview.
        *   Refresh button for the problemset list.
    *   Tree View: "My Submissions" - Lists the user's recent submissions.
        *   Displays submission ID, problem, status, language, and time.
        *   Uses icons to indicate submission status (Accepted, Wrong Answer, Pending, etc.).
        *   Clicking a submission opens its details (including code, if accessible) in a Webview.
        *   Refresh button for the submission list.
    *   Webview for viewing Problem details (description, input/output formats, examples).
    *   Webview for viewing Submission details (status, score, resources, message, code).
    *   Command `ACMOJ: View Problem by ID...` to open a specific problem's details via input prompt.
    *   Command `ACMOJ: Submit Current File` (available via command palette and editor title bar button) to submit the code in the active editor.
        *   Prompts for Problem ID if not triggered from a specific context.
        *   Prompts user to select the submission language from available options for the problem.
    *   Basic error handling for API requests and token validation.
    *   Configuration setting `acmoj.baseUrl`.