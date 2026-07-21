import { mockProjects, type Project } from '$lib/types';

export const projects = $state<Project[]>([...mockProjects]);

export const draftUpload = $state<{ fileName: string | null }>({ fileName: null });

export function addProject(project: Project) {
	projects.unshift(project);
}
