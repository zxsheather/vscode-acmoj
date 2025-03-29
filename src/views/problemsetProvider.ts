import * as vscode from 'vscode';
import { ApiClient } from '../api';
import { Problemset, ProblemBrief } from '../types';
import { AuthService } from '../auth';

type ProblemsetCategory = 'upcoming' | 'ongoing' | 'passed';

class CategoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly categoryType: ProblemsetCategory,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Expanded // Expand categories by default
    ) {
        super(label, collapsibleState);
        this.id = `category-${categoryType}`;
        // Optional: Add icons for categories
        switch(categoryType) {
            case 'ongoing': this.iconPath = new vscode.ThemeIcon('debug-start'); break;
            case 'upcoming': this.iconPath = new vscode.ThemeIcon('calendar'); break;
            case 'passed': this.iconPath = new vscode.ThemeIcon('check-all'); break;
        }
    }
    // Add context value if needed for specific menu contributions
    // contextValue = 'problemsetCategory';
}

type AcmojTreeItem = CategoryTreeItem | ProblemsetTreeItem | ProblemBriefTreeItem | vscode.TreeItem;

export class ProblemsetProvider implements vscode.TreeDataProvider<AcmojTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AcmojTreeItem | undefined | null | void> = new vscode.EventEmitter<AcmojTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<AcmojTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private problemsetCache: Map<number, Problemset> = new Map();

    constructor(private apiClient: ApiClient, private authService: AuthService) {
        authService.onDidChangeLoginStatus(() => this.refresh());
    }

    refresh(): void {
        this.problemsetCache.clear(); // Clear cache on refresh
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AcmojTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: AcmojTreeItem): Promise<AcmojTreeItem[]> {
        if (!this.authService.isLoggedIn()) {
            return [new vscode.TreeItem("Please set token to view problemsets", vscode.TreeItemCollapsibleState.None)];
        }

        if (element instanceof ProblemsetTreeItem) {
            // Children of a Problemset are its Problems
            try {
                let problemsetDetails = this.problemsetCache.get(element.problemset.id);
                if (!problemsetDetails) {
                    // Fetch details if not cached (API spec for /user/problemsets might not include problems array)
                    // Or, if /user/problemsets *does* include problems, use element.problemset.problems directly
                    console.log(`Fetching details for problemset ${element.problemset.id}`);
                    problemsetDetails = await this.apiClient.getProblemsetDetails(element.problemset.id);
                    this.problemsetCache.set(element.problemset.id, problemsetDetails);
                }

                if (problemsetDetails && problemsetDetails.problems) {
                    return problemsetDetails.problems.map(p => new ProblemBriefTreeItem(p));
                } else {
                    return [new vscode.TreeItem("No problems found in this problemset.", vscode.TreeItemCollapsibleState.None)];
                }
            } catch (error: any) {
                 vscode.window.showErrorMessage(`Failed to load problems for problemset ${element.problemset.id}: ${error.message}`);
                 return [new vscode.TreeItem(`Error: ${error.message}`, vscode.TreeItemCollapsibleState.None)];
            }

        } else if (!element) {
            // Root level: Show user's problemsets
            try {
                const { problemsets } = await this.apiClient.getUserProblemsets();
                 // Cache the fetched problemsets if they contain enough info (like problems array)
                 // problemsets.forEach(ps => this.problemsetCache.set(ps.id, ps)); // Optional: Cache if full data is returned
                return problemsets.map(ps => new ProblemsetTreeItem(ps));
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to load problemsets: ${error.message}`);
                return [new vscode.TreeItem(`Error: ${error.message}`, vscode.TreeItemCollapsibleState.None)];
            }
        } else {
            // Children of a ProblemBriefTreeItem (leaf node)
            return [];
        }
    }
}

// Represents a Problemset in the TreeView
export class ProblemsetTreeItem extends vscode.TreeItem {
    constructor(public readonly problemset: Problemset) {
        super(
            problemset.name || `Problemset ${problemset.id}`,
            // Problemsets are expandable to show problems
            vscode.TreeItemCollapsibleState.Collapsed
        );
        this.tooltip = `${problemset.name}\nType: ${problemset.type}\nStarts: ${new Date(problemset.start_time).toLocaleString()}\nEnds: ${new Date(problemset.end_time).toLocaleString()}`;
        this.description = `(${problemset.type})`;
        this.id = `problemset-${problemset.id}`;
        // Optional: Icon based on type
        // this.iconPath = ...
    }
}


// Represents a Problem Brief within a Problemset (renamed from ProblemTreeItem)
export class ProblemBriefTreeItem extends vscode.TreeItem {
    constructor(public readonly problem: ProblemBrief) {
        super(
            `${problem.id}: ${problem.title || '(Title Unavailable)'}`,
            vscode.TreeItemCollapsibleState.None // Problems are leaf nodes here
        );
        this.tooltip = `Problem ${problem.id}`;
        this.description = problem.title ? '' : 'Not published or no permission';
        this.id = `problem-${problem.id}`;
        if (problem.id) {
            this.command = {
                command: 'acmoj.viewProblem',
                title: 'View Problem',
                arguments: [problem.id] // Pass problem ID
            };
        }
    }
}