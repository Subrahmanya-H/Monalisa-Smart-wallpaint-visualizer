import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type ThemeMotif = 'solid' | 'geometric' | 'botanical' | 'halloween' | 'vintage' | 'graffiti' | 'gallery';

export interface PaintTheme {
  id: string;
  slug: string;
  name: string;
  description: string;
  motif: ThemeMotif;
  baseColor: string;
  accentColor: string;
  imageUrl: string;
  isActive: boolean;
  isBuiltIn: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ThemeInput = Omit<PaintTheme, 'id' | 'slug' | 'isBuiltIn' | 'createdAt' | 'updatedAt'>;

@Injectable({ providedIn: 'root' })
export class ThemeService {
  constructor(private readonly http: HttpClient) {}

  listAvailable(): Observable<{ themes: PaintTheme[] }> {
    return this.http.get<{ themes: PaintTheme[] }>('/api/themes');
  }

  listForAdmin(): Observable<{ themes: PaintTheme[] }> {
    return this.http.get<{ themes: PaintTheme[] }>('/api/admin/themes');
  }

  create(theme: ThemeInput): Observable<{ theme: PaintTheme }> {
    return this.http.post<{ theme: PaintTheme }>('/api/admin/themes', theme);
  }

  update(id: string, theme: ThemeInput): Observable<{ theme: PaintTheme }> {
    return this.http.put<{ theme: PaintTheme }>(`/api/admin/themes/${encodeURIComponent(id)}`, theme);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/admin/themes/${encodeURIComponent(id)}`);
  }

  uploadImage(file: File): Observable<{ url: string }> {
    const body = new FormData();
    body.append('image', file);
    return this.http.post<{ url: string }>('/api/admin/themes/image', body);
  }
}
