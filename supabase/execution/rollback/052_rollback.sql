-- Rollback of 052_cs_plot.sql — run by hand only. Removes the plot plan (and its drawn shapes).
drop table if exists public.cs_plot_shapes;
drop function if exists public.cs_plot_ref();
