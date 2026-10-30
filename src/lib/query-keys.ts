/** Fábrica central de chaves do React Query (ver docs/05-padroes-de-nomes.md). */
export const queryKeys = {
  projects: (uid: string) => ['projects', uid] as const,
  project: (projectId: string) => ['project', projectId] as const,
  files: (projectId: string) => ['project', projectId, 'files'] as const,
  snapshots: (projectId: string) => ['project', projectId, 'snapshots'] as const,
  reviews: (projectId: string) => ['project', projectId, 'reviews'] as const,
  threads: (projectId: string, reviewId: string) => ['project', projectId, 'reviews', reviewId, 'threads'] as const,
  diffJob: (projectId: string, diffKey: string) => ['project', projectId, 'diffJobs', diffKey] as const,
};
