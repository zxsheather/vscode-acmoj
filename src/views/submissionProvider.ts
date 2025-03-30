import * as vscode from 'vscode'
import { ApiClient } from '../api'
import { SubmissionBrief, SubmissionStatus } from '../types'
import { AuthService } from '../auth'

export class SubmissionProvider
  implements vscode.TreeDataProvider<SubmissionTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    SubmissionTreeItem | undefined | null | void
  > = new vscode.EventEmitter<SubmissionTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<
    SubmissionTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event

  private currentPage: number = 1

  constructor(
    private apiClient: ApiClient,
    private authService: AuthService,
  ) {
    authService.onDidChangeLoginStatus(() => this.refresh())
  }

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: SubmissionTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(
    element?: SubmissionTreeItem,
  ): Promise<SubmissionTreeItem[]> {
    if (!this.authService.isLoggedIn()) {
      return [
        new vscode.TreeItem(
          'Please login to view submissions',
          vscode.TreeItemCollapsibleState.None,
        ) as SubmissionTreeItem,
      ]
    }

    if (element) {
      return []
    } else {
      try {
        const profile = await this.apiClient.getUserProfile()
        const username = profile.username
        const { submissions } = await this.apiClient.getSubmissions(
          undefined,
          username,
        )
        return submissions.map((s) => new SubmissionTreeItem(s))
        // TODO: implement pagination
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to load submissions: ${error.message}`,
        )
        return [
          new vscode.TreeItem(
            `Error: ${error.message}`,
            vscode.TreeItemCollapsibleState.None,
          ) as SubmissionTreeItem,
        ]
      }
    }
  }
}

export class SubmissionTreeItem extends vscode.TreeItem {
  constructor(public readonly submission: SubmissionBrief) {
    const problemTitle =
      submission.problem?.title || `Problem ${submission.problem?.id || '?'}`
    const date = new Date(submission.created_at).toLocaleString()

    super(
      `#${submission.id} - ${problemTitle}`,
      vscode.TreeItemCollapsibleState.None,
    )

    this.description = `${submission.status} (${submission.language}) - ${date}`
    this.tooltip = `Submission ${submission.id}\nStatus: ${submission.status}\nLanguage: ${submission.language}\nTime: ${date}`

    this.id = `submission-${this.submission.id}`

    if (submission.id) {
      this.command = {
        command: 'acmoj.viewSubmission',
        title: 'View Submission Details',
        arguments: [submission.id],
      }
    }
    this.iconPath = SubmissionTreeItem.getIconForStatus(submission.status)
  }

  static getIconForStatus(status: SubmissionStatus): vscode.ThemeIcon {
    switch (status) {
      case 'accepted':
        return new vscode.ThemeIcon(
          'check',
          new vscode.ThemeColor('testing.iconPassed'),
        )
      case 'wrong_answer':
      case 'runtime_error':
      case 'memory_leak':
      case 'bad_problem':
      case 'unknown_error':
      case 'system_error':
        return new vscode.ThemeIcon(
          'error',
          new vscode.ThemeColor('testing.iconFailed'),
        )
      case 'compile_error':
        return new vscode.ThemeIcon(
          'warning',
          new vscode.ThemeColor('testing.iconErrored'),
        )
      case 'time_limit_exceeded':
      case 'memory_limit_exceeded':
      case 'disk_limit_exceeded':
        return new vscode.ThemeIcon(
          'clock',
          new vscode.ThemeColor('testing.iconSkipped'),
        )
      case 'pending':
      case 'compiling':
      case 'judging':
        return new vscode.ThemeIcon('sync~spin')
      case 'aborted':
      case 'void':
      case 'skipped':
        return new vscode.ThemeIcon(
          'circle-slash',
          new vscode.ThemeColor('testing.iconSkipped'),
        )
      default:
        return new vscode.ThemeIcon('question')
    }
  }
}
