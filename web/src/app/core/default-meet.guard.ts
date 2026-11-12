import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { DataService } from './data.service';
import { newestMeetCode } from './meet-index';

// Root redirect: load the meet index, then send to the newest meet's Championship standings.
export const defaultMeetRedirect: CanActivateFn = async (): Promise<UrlTree> => {
  const data = inject(DataService);
  const router = inject(Router);
  const idx = await data.ensureIndex();
  // The fallback only applies when the index could not be loaded.
  const code = newestMeetCode(idx) ?? '2026CSA';
  return router.createUrlTree(['/', code, 'championship', 'scores']);
};
