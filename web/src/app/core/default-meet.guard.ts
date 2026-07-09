import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { DataService } from './data.service';

// Root redirect: load the meet index, then send to the first meet's Championship standings.
export const defaultMeetRedirect: CanActivateFn = async (): Promise<UrlTree> => {
  const data = inject(DataService);
  const router = inject(Router);
  const idx = await data.ensureIndex();
  const code = idx[0]?.code ?? '2025CSA';
  return router.createUrlTree(['/', code, 'championship', 'scores']);
};
