import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DataService } from './core/data.service';
import { DivisionService } from './core/division.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly data = inject(DataService);
  protected readonly div = inject(DivisionService);

  protected readonly navItems = [
    { seg: 'scores', label: 'Standings' },
    { seg: 'teams', label: 'Teams' },
    { seg: 'swimmers', label: 'Swimmers' },
    { seg: 'events', label: 'Events' },
    { seg: 'high-scorers', label: 'High Scorers' },
    { seg: 'improvements', label: 'Improvements' },
  ];

  protected readonly nav = computed(() =>
    this.navItems.map((i) => ({ ...i, link: this.div.link(i.seg) })),
  );
}
