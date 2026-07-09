import { Routes } from '@angular/router';
import { defaultMeetRedirect } from './core/default-meet.guard';

// Routes shared by both divisions ("meets") within a scraped meet. The active meet is the
// first URL segment and the division is the second; DivisionService reads them.
const divisionRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'scores' },
  { path: 'scores', loadComponent: () => import('./features/scores/scores').then((m) => m.Scores), title: 'Standings' },
  { path: 'teams', loadComponent: () => import('./features/teams/teams').then((m) => m.Teams), title: 'Teams' },
  { path: 'teams/:id', loadComponent: () => import('./features/teams/team-detail').then((m) => m.TeamDetail), title: 'Team' },
  { path: 'swimmers', loadComponent: () => import('./features/swimmers/swimmers').then((m) => m.Swimmers), title: 'Swimmers' },
  { path: 'swimmers/:id', loadComponent: () => import('./features/swimmers/swimmer-detail').then((m) => m.SwimmerDetail), title: 'Swimmer' },
  { path: 'events', loadComponent: () => import('./features/events/events').then((m) => m.Events), title: 'Events' },
  { path: 'events/:id', loadComponent: () => import('./features/events/event-detail').then((m) => m.EventDetail), title: 'Event' },
  { path: 'high-scorers', loadComponent: () => import('./features/high-scorers/high-scorers').then((m) => m.HighScorers), title: 'High Scorers' },
  { path: 'improvements', loadComponent: () => import('./features/improvements/improvements').then((m) => m.Improvements), title: 'Improvements' },
];

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [defaultMeetRedirect], children: [] },
  {
    path: ':meet',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'championship/scores' },
      { path: 'championship', children: divisionRoutes },
      { path: 'open', children: divisionRoutes },
      { path: '**', redirectTo: 'championship/scores' },
    ],
  },
  { path: '**', canActivate: [defaultMeetRedirect], children: [] },
];
