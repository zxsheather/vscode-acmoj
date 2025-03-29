import * as vscode from 'vscode';
import { ApiClient } from '../api';
import { Problemset, ProblemBrief } from '../types';
import { AuthService } from '../auth';

type AcmojTreeItem = CategoryTreeItem | ProblemsetTreeItem | ProblemBriefTreeItem | vscode.TreeItem;

export class ProblemsetProvider implements vscode.TreeDataProvider<AcmojTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AcmojTreeItem | undefined | null | void> = new vscode.EventEmitter<AcmojTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<AcmojTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private allProblemsets: Problemset[] | null = null;
    private problemsetCache: Map<number, Problemset> = new Map(); // Keep cache for details

    constructor(private apiClient: ApiClient, private authService: AuthService) {
        authService.onDidChangeLoginStatus(() => this.refresh());
    }

    refresh(): void {
        this.allProblemsets = null; // Clear the full list cache
        this.problemsetCache.clear(); // Clear details cache
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AcmojTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: AcmojTreeItem): Promise<AcmojTreeItem[]> {
        if (!this.authService.isLoggedIn()) {
            return [new vscode.TreeItem("Please set token to view problemsets", vscode.TreeItemCollapsibleState.None)];
        }

        // Root level: Return the categories
        if (!element) {
            // Fetch all problemsets if not already fetched in this cycle
            if (this.allProblemsets === null) {
                try {
                    const { problemsets } = await this.apiClient.getUserProblemsets();
                    this.allProblemsets = problemsets;
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Failed to load problemsets: ${error.message}`);
                    this.allProblemsets = []; // Avoid retrying on error within the same cycle
                    return [new vscode.TreeItem(`Error loading problemsets: ${error.message}`, vscode.TreeItemCollapsibleState.None)];
                }
            }
            // Return the static category nodes
            return [
                new CategoryTreeItem('Ongoing', 'ongoing'),
                new CategoryTreeItem('Upcoming', 'upcoming'),
                new CategoryTreeItem('Passed', 'passed'),
            ];
        }

        // Category level: Return problemsets belonging to this category
        if (element instanceof CategoryTreeItem) {
            if (this.allProblemsets === null) {
                console.warn("Problemsets not loaded when expanding category, fetching again.");
                 try {
                    const { problemsets } = await this.apiClient.getUserProblemsets();
                    this.allProblemsets = problemsets;
                 } catch (error: any) {
                     return [new vscode.TreeItem(`Error loading problemsets: ${error.message}`, vscode.TreeItemCollapsibleState.None)];
                 }
            }

            const now = new Date();
            const categoryProblemsets = this.allProblemsets.filter(ps => {
                try {
                    const startTime = new Date(ps.start_time);
                    const endTime = new Date(ps.end_time);

                    switch (element.categoryType) {
                        case 'ongoing':
                            return now >= startTime && now < endTime;
                        case 'upcoming':
                            return now < startTime;
                        case 'passed':
                            return now >= endTime;
                        default:
                            return false;
                    }
                } catch (e) {
                    console.error(`Error parsing dates for problemset ${ps.id}:`, e);
                    return false; // Exclude if dates are invalid
                }
            });

            // Sort within category
            categoryProblemsets.sort((a, b) => {
                 try {
                    const startTimeA = new Date(a.start_time).getTime();
                    const endTimeA = new Date(a.end_time).getTime();
                    const startTimeB = new Date(b.start_time).getTime();
                    const endTimeB = new Date(b.end_time).getTime();

                    switch (element.categoryType) {
                        case 'ongoing': return endTimeA - endTimeB; // Closest deadline first
                        case 'upcoming': return startTimeA - startTimeB; // Starting soonest first
                        case 'passed': return endTimeB - endTimeA; // Ended most recently first
                        default: return 0;
                    }
                 } catch { return 0; } // Handle errors in date parsing gracefully
            });


            if (categoryProblemsets.length === 0) {
                return [new vscode.TreeItem(`No ${element.categoryType} problemsets found.`, vscode.TreeItemCollapsibleState.None)];
            }

            return categoryProblemsets.map(ps => new ProblemsetTreeItem(ps));
        }

        // Problemset level: Return problems within the problemset
        if (element instanceof ProblemsetTreeItem) {
            try {
                let problemsetDetails = this.problemsetCache.get(element.problemset.id);
                if (!problemsetDetails || !problemsetDetails.problems) {
                    console.log(`Fetching details for problemset ${element.problemset.id}`);
                    problemsetDetails = await this.apiClient.getProblemsetDetails(element.problemset.id);
                    this.problemsetCache.set(element.problemset.id, problemsetDetails);
                }

                if (problemsetDetails && problemsetDetails.problems && problemsetDetails.problems.length > 0) {
                    // Sort problems by ID
                    problemsetDetails.problems.sort((a, b) => a.id - b.id);
                    return problemsetDetails.problems.map(p => new ProblemBriefTreeItem(p));
                } else {
                    return [new vscode.TreeItem("No problems found in this problemset.", vscode.TreeItemCollapsibleState.None)];
                }
            } catch (error: any) {
                 vscode.window.showErrorMessage(`Failed to load problems for problemset ${element.problemset.id}: ${error.message}`);
                 return [new vscode.TreeItem(`Error: ${error.message}`, vscode.TreeItemCollapsibleState.None)];
            }
        }

        // Problem level (leaf node)
        if (element instanceof ProblemBriefTreeItem) {
            return [];
        }

        return [];
    }
}

type ProblemsetCategory = 'upcoming' | 'ongoing' | 'passed';

class CategoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly categoryType: ProblemsetCategory,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        super(label, collapsibleState);
        this.id = `category-${categoryType}`;
        switch(categoryType) {
            case 'ongoing': this.iconPath = new vscode.ThemeIcon('debug-start'); break;
            case 'upcoming': this.iconPath = new vscode.ThemeIcon('calendar'); break;
            case 'passed': this.iconPath = new vscode.ThemeIcon('check-all'); break;
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