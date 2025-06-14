import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private users = [
    { username: 'admin', password: 'admin123' },
    { username: 'max', password: 'ventil2024' },
  ];

  private loggedIn = false;

  login(username: string, password: string): boolean {
    const found = this.users.find(
      (u) => u.username === username && u.password === password
    );
    this.loggedIn = !!found;
    return this.loggedIn;
  }

  logout() {
    this.loggedIn = false;
  }

  isAuthenticated(): boolean {
    return this.loggedIn;
  }
}
