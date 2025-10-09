import { Component, HostBinding } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'conv-analytics';
  dark = false;

  constructor() {
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'dark' || stored === 'light') {
        this.dark = stored === 'dark';
      } else {
        // default to dark mode when no preference saved
        this.dark = true;
        localStorage.setItem('theme', 'dark');
      }
      document.body.classList.toggle('dark-theme', this.dark);
    } catch (e) {}
  }

  toggleDark(): void {
    this.dark = !this.dark;
    try { localStorage.setItem('theme', this.dark ? 'dark' : 'light'); } catch (e) {}
    document.body.classList.toggle('dark-theme', this.dark);
  }
}
