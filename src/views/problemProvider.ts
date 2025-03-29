import * as vscode from "vscode";
import { ApiClient } from "../api";
import { ProblemBrief } from "../types";
import { AuthService } from "../auth";

export class ProblemProvider
  implements vscode.TreeDataProvider<ProblemTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    ProblemTreeItem | undefined | null | void
  > = new vscode.EventEmitter<ProblemTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    ProblemTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private apiClient: ApiClient, private authService: AuthService) {
    authService.onDidChangeLoginStatus(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ProblemTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ProblemTreeItem): Promise<ProblemTreeItem[]> {
    if (!this.authService.isLoggedIn()) {
      return [
        new vscode.TreeItem(
          "Please login to view problems",
          vscode.TreeItemCollapsibleState.None
        ) as ProblemTreeItem,
      ];
    }

    if (element) {
      // simple implementation: no children
      return [];
    } else {
      try {
        // toy implementation: get the first page of problems
        const { problems } = await this.apiClient.getProblems();
        return problems.map((p) => new ProblemTreeItem(p));
        // TODO: implement pagination
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to load problems: ${error.message}`
        );
        return [
          new vscode.TreeItem(
            `Error: ${error.message}`,
            vscode.TreeItemCollapsibleState.None
          ) as ProblemTreeItem,
        ];
      }
    }
  }
}

export class ProblemTreeItem extends vscode.TreeItem {
  constructor(public readonly problem: ProblemBrief) {
    super(
      `${problem.id}: ${problem.title || "(Title Unavailable)"}`,
      vscode.TreeItemCollapsibleState.None
    );
    this.tooltip = `Problem ${problem.id}`;
    this.description = problem.title ? "" : "Not published or no permission";

    this.id = `problem-${this.problem.id}`;

    if (problem.id) {
      this.command = {
        command: "acmoj.viewProblem",
        title: "View Problem",
        arguments: [problem.id],
      };
    }
  }
}
