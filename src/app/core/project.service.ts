import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface SavedProjectPolygon {
  name: string;
  points: { x: number; y: number }[];
  color: string;
  opacity: number;
  finish: 'matte' | 'satin' | 'glossy' | 'textured';
  design: string;
}

export interface SavedProjectSummary {
  id: string;
  projectName: string;
  thumbnailUrl: string;
  polygonCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedProject extends SavedProjectSummary {
  originalImageUrl: string;
  canvasImageUrl: string;
  selectedColor: string;
  selectedDesign: string;
  polygons: SavedProjectPolygon[];
}

interface SavedProjectsResponse {
  projects: SavedProjectSummary[];
}

interface SaveProjectResponse {
  project: SavedProjectSummary;
}

interface SavedProjectResponse {
  project: SavedProject;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  constructor(private readonly http: HttpClient) {}

  list(): Observable<SavedProjectsResponse> {
    return this.http.get<SavedProjectsResponse>('/api/projects');
  }

  get(id: string): Observable<SavedProjectResponse> {
    return this.http.get<SavedProjectResponse>(`/api/projects/${encodeURIComponent(id)}`);
  }

  save(project: {
    projectName: string;
    originalImageUrl: string;
    canvasImageUrl: string;
    thumbnailUrl: string;
    selectedColor: string;
    selectedDesign: SavedProject['selectedDesign'];
    polygons: SavedProjectPolygon[];
  }): Observable<SaveProjectResponse> {
    return this.http.post<SaveProjectResponse>('/api/projects', project);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/projects/${encodeURIComponent(id)}`);
  }
}
