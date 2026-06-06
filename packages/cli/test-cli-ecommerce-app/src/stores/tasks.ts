import { $store } from "@kallo/runtime";

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
}

export const useTaskStore = $store({
  tasks: [] as Task[],
  get total() {
    return this.tasks.length;
  },
  get completedCount() {
    return this.tasks.filter(t => t.completed).length;
  },
  get pendingCount() {
    return this.tasks.filter(t => !t.completed).length;
  },
  setTasks(newTasks: Task[]) {
    this.tasks = newTasks;
  },
  addTask(title: string, priority: "low" | "medium" | "high") {
    this.tasks.push({ id: String(Date.now()), title, completed: false, priority });
  },
  toggleTask(id: string) {
    const task = this.tasks.find(t => t.id === id);
    if (task) task.completed = !task.completed;
  },
  deleteTask(id: string) {
    this.tasks = this.tasks.filter(t => t.id !== id);
  }
});
