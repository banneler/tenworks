-- Enable Realtime for Schedule/Talent/Projects (punch list #6)
-- So open tabs can receive live updates when project_tasks or projects change.

ALTER PUBLICATION supabase_realtime ADD TABLE public.project_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
