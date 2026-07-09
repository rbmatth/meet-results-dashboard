import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DataService } from './core/data.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly data = inject(DataService);

  protected readonly nav = [
    { path: '/scores', label: 'Standings' },
    { path: '/teams', label: 'Teams' },
    { path: '/swimmers', label: 'Swimmers' },
    { path: '/events', label: 'Events' },
    { path: '/high-scorers', label: 'High Scorers' },
    { path: '/improvements', label: 'Improvements' },
  ];
}
