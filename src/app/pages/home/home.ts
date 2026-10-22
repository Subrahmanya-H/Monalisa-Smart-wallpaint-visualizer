import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { ProjectService, SavedProject, SavedProjectSummary } from '../../core/project.service';
import { PaintTheme, ThemeService } from '../../core/theme.service';

interface Point {
  x: number;
  y: number;
}

interface Polygon {
  name: string;
  points: Point[];
  color: string;
  opacity: number;
  finish: Finish;
  design: DesignId;
}

type Finish = 'matte' | 'satin' | 'glossy' | 'textured';
type DesignId = string;

interface UndoSnapshot {
  baseImage: ImageData;
  polygons: Polygon[];
  selectedPolygonIndex: number;
  originalImage: HTMLImageElement | null;
}

type Tool = 'brush' | 'eraser' | 'polygon';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home implements OnInit {
  @ViewChild('wallCanvas')
  canvasRef!: ElementRef<HTMLCanvasElement>;

  selectedColor = '#464feb';
  readonly colorPalette = [
    { name: 'Warm white', value: '#f2e8d5' },
    { name: 'Soft cream', value: '#e9d5b1' },
    { name: 'Sage green', value: '#91a88b' },
    { name: 'Terracotta', value: '#c9785b' },
    { name: 'Dusty blue', value: '#7895b8' },
    { name: 'Charcoal', value: '#50545c' },
    { name: 'Lavender', value: '#a69acb' },
    { name: 'Blush pink', value: '#d99b9a' }
  ];
  designs: PaintTheme[] = [];
  selectedDesign: DesignId = 'solid';
  readonly finishes: { id: Finish; name: string; description: string }[] = [
    { id: 'matte', name: 'Matte', description: 'Soft, low-sheen finish' },
    { id: 'satin', name: 'Satin', description: 'A gentle, smooth glow' },
    { id: 'glossy', name: 'Glossy', description: 'Bright reflective sheen' },
    { id: 'textured', name: 'Textured', description: 'Subtle stippled surface' }
  ];
  readonly auth: AuthService;
  currentTool: Tool = 'brush';
  isDrawing = false;
  polygons: Polygon[] = [];
  selectedPolygonIndex = -1;
  draftPoints: Point[] = [];
  isEditingPolygon = false;
  selectedImageFile: File | null = null;
  originalImageUrl: string | null = null;
  cloudImageUrl: string | null = null;
  cloudUploadMessage = '';
  isCloudUploadBusy = false;
  showBeforeAfter = false;
  comparisonPosition = 50;
  savedProjects: SavedProjectSummary[] = [];
  projectName = '';
  projectMessage = '';
  isSavingProject = false;
  isLoadingProjects = false;
  loadingProjectId: string | null = null;
  isHelpOpen = false;
  readonly showHalloweenBanner = new Date().getMonth() === 9;
  private originalImage: HTMLImageElement | null = null;
  private previewPoint: Point | null = null;
  private draggedVertexIndex: number | null = null;
  private undoSnapshot: UndoSnapshot | null = null;
  private baseCanvas = document.createElement('canvas');

  constructor(
    auth: AuthService,
    private readonly projectService: ProjectService,
    private readonly themeService: ThemeService
  ) {
    this.auth = auth;
  }

  ngOnInit(): void {
    this.themeService.listAvailable().subscribe({
      next: ({ themes }) => {
        this.designs = themes;
      },
      error: (error: HttpErrorResponse) => {
        console.error('Could not load available wall themes.', error);
      }
    });

    this.auth.getCurrentUser().subscribe({
      next: (user) => {
        if (user) {
          this.loadSavedProjects();
        }
      },
      error: (error: HttpErrorResponse) => {
        console.error('Could not check the session before loading saved projects.', error);
      }
    });
  }

  get selectedPolygon(): Polygon | null {
    return this.polygons[this.selectedPolygonIndex] ?? null;
  }

  get canUndo(): boolean {
    return this.undoSnapshot !== null;
  }

  get canvasMessage(): string {
    if (this.currentTool === 'polygon') {
      return 'Click to add corners to your new polygon.';
    }
    if (this.currentTool === 'brush') {
      return 'Paint directly on the image, or select a polygon to color a larger area.';
    }
    return 'Erase brush strokes from the image.';
  }

  ngAfterViewInit(): void {
    this.baseCanvas.width = this.canvasRef.nativeElement.width;
    this.baseCanvas.height = this.canvasRef.nativeElement.height;
    this.renderCanvas();
  }

  applyDesign(design: DesignId): void {
    this.selectedDesign = design;
    const theme = this.designs.find((item) => item.slug === design);
    if (theme) {
      this.selectedColor = theme.baseColor;
    }
    const polygon = this.selectedPolygon;
    if (!polygon) {
      return;
    }

    this.saveUndoSnapshot();
    polygon.design = design;
    if (theme) {
      polygon.color = theme.baseColor;
    }
    this.renderCanvas();
  }

  setTool(tool: 'brush' | 'eraser'): void {
    this.currentTool = tool;
    this.isEditingPolygon = false;
    this.isDrawing = false;
    this.previewPoint = null;
    this.renderCanvas();
  }

  startPolygon(): void {
    this.currentTool = 'polygon';
    this.isEditingPolygon = false;
    this.draftPoints = [];
    this.previewPoint = null;
    this.isDrawing = false;
    this.renderCanvas();
  }

  onCanvasPointerDown(event: PointerEvent): void {
    const point = this.getCanvasPoint(event);

    if (this.isEditingPolygon && this.selectedPolygon) {
      const vertexIndex = this.findNearestVertex(point, this.selectedPolygon.points);
      if (vertexIndex !== null) {
        this.saveUndoSnapshot();
        this.draggedVertexIndex = vertexIndex;
        this.canvasRef.nativeElement.setPointerCapture(event.pointerId);
      }
      return;
    }

    if (this.currentTool === 'polygon') {
      this.draftPoints.push(point);
      this.previewPoint = null;
      this.renderCanvas();
      return;
    }

    this.isDrawing = true;
    this.saveUndoSnapshot();
    this.canvasRef.nativeElement.setPointerCapture(event.pointerId);
    this.drawBrushStroke(point, point);
  }

  onCanvasPointerMove(event: PointerEvent): void {
    const point = this.getCanvasPoint(event);

    if (this.draggedVertexIndex !== null && this.selectedPolygon) {
      this.selectedPolygon.points[this.draggedVertexIndex] = point;
      this.renderCanvas();
      return;
    }

    if (this.currentTool === 'polygon' && this.draftPoints.length > 0) {
      this.previewPoint = point;
      this.renderCanvas();
      return;
    }

    if (!this.isDrawing) {
      return;
    }

    this.drawBrushStroke(this.lastBrushPoint ?? point, point);
    this.lastBrushPoint = point;
  }

  stopDrawing(): void {
    this.isDrawing = false;
    this.draggedVertexIndex = null;
    this.lastBrushPoint = null;
  }

  onCanvasPointerLeave(): void {
    this.stopDrawing();
    if (this.previewPoint) {
      this.previewPoint = null;
      this.renderCanvas();
    }
  }

  finishPolygon(): void {
    if (this.draftPoints.length < 3) {
      return;
    }

    const polygonNumber = this.polygons.length + 1;
    this.saveUndoSnapshot();
    this.polygons.push({
      name: `Polygon ${polygonNumber}`,
      points: [...this.draftPoints],
      color: this.selectedColor,
      opacity: 0.18,
      finish: 'matte',
      design: this.selectedDesign
    });
    this.selectedPolygonIndex = this.polygons.length - 1;
    this.draftPoints = [];
    this.previewPoint = null;
    this.currentTool = 'brush';
    this.renderCanvas();
  }

  cancelPolygon(): void {
    this.draftPoints = [];
    this.previewPoint = null;
    this.currentTool = 'brush';
    this.renderCanvas();
  }

  selectPolygon(index: number): void {
    this.selectedPolygonIndex = Number(index);
    this.isEditingPolygon = false;
    this.selectedDesign = this.selectedPolygon?.design ?? 'solid';
    this.renderCanvas();
  }

  togglePolygonEditing(): void {
    this.isEditingPolygon = !this.isEditingPolygon;
    this.stopDrawing();
    this.renderCanvas();
  }

  applyPolygonColor(): void {
    const polygon = this.selectedPolygon;
    if (!polygon) {
      return;
    }

    this.saveUndoSnapshot();
    polygon.color = this.selectedColor;
    polygon.opacity = Math.min(polygon.opacity + 0.18, 0.9);
    this.renderCanvas();
  }

  applyPaletteColor(color: string): void {
    this.selectedColor = color;
    const polygon = this.selectedPolygon;
    if (!polygon) {
      return;
    }

    this.saveUndoSnapshot();
    polygon.color = color;
    polygon.opacity = Math.min(Math.max(polygon.opacity, 0.3) + 0.12, 0.78);
    this.renderCanvas();
  }

  applyFinish(finish: Finish): void {
    const polygon = this.selectedPolygon;
    if (!polygon) {
      return;
    }

    this.saveUndoSnapshot();
    polygon.finish = finish;
    this.renderCanvas();
  }

  deleteSelectedPolygon(): void {
    if (!this.selectedPolygon) {
      return;
    }

    this.saveUndoSnapshot();
    this.polygons.splice(this.selectedPolygonIndex, 1);
    this.selectedPolygonIndex = this.polygons.length > 0
      ? Math.min(this.selectedPolygonIndex, this.polygons.length - 1)
      : -1;
    this.isEditingPolygon = false;
    this.renderCanvas();
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.isHelpOpen) {
      this.closeHelp();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && this.canUndo) {
      event.preventDefault();
      this.undo();
    }
  }

  openHelp(): void {
    this.isHelpOpen = true;
  }

  closeHelp(): void {
    this.isHelpOpen = false;
  }

  undo(): void {
    if (!this.undoSnapshot) {
      return;
    }

    const snapshot = this.undoSnapshot;
    this.undoSnapshot = null;
    const context = this.baseCanvas.getContext('2d');
    if (!context) {
      return;
    }

    context.putImageData(snapshot.baseImage, 0, 0);
    this.polygons = snapshot.polygons;
    this.selectedPolygonIndex = snapshot.selectedPolygonIndex;
    this.selectedDesign = this.normalizeDesign(this.selectedPolygon?.design);
    this.originalImage = snapshot.originalImage;
    this.isEditingPolygon = false;
    this.renderCanvas();
  }

  onImageUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.selectedImageFile = file;
    this.cloudImageUrl = null;
    this.cloudUploadMessage = '';

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return;
      }
      this.originalImageUrl = reader.result;
      const image = new Image();
      image.onload = () => {
        this.saveUndoSnapshot();
        this.originalImage = image;
        const context = this.baseCanvas.getContext('2d');
        if (!context) {
          return;
        }

        context.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
        context.drawImage(image, 0, 0, this.baseCanvas.width, this.baseCanvas.height);
        this.polygons = [];
        this.selectedPolygonIndex = -1;
        this.selectedDesign = 'solid';
        this.draftPoints = [];
        this.isEditingPolygon = false;
        this.renderCanvas();
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  uploadImageToCloudinary(): void {
    if (!this.selectedImageFile || this.isCloudUploadBusy) {
      return;
    }

    this.isCloudUploadBusy = true;
    this.cloudUploadMessage = '';
    this.auth.uploadRoomImage(this.selectedImageFile).subscribe({
      next: ({ url }) => {
        this.cloudImageUrl = url;
        this.cloudUploadMessage = 'Image uploaded successfully.';
        this.isCloudUploadBusy = false;
      },
      error: (error: HttpErrorResponse) => {
        this.cloudUploadMessage = error.error?.message ?? 'Image upload failed. Check the API and Cloudinary configuration.';
        this.isCloudUploadBusy = false;
      }
    });
  }

  resetCanvas(): void {
    const context = this.baseCanvas.getContext('2d');
    if (!context) {
      return;
    }

    this.saveUndoSnapshot();
    context.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
    if (this.originalImage) {
      context.drawImage(this.originalImage, 0, 0, this.baseCanvas.width, this.baseCanvas.height);
    }
    this.polygons = [];
    this.selectedPolygonIndex = -1;
    this.selectedDesign = 'none';
    this.draftPoints = [];
    this.isEditingPolygon = false;
    this.previewPoint = null;
    this.isDrawing = false;
    this.currentTool = 'brush';
    this.renderCanvas();
  }

  downloadCanvas(): void {
    const canvas = document.createElement('canvas');
    canvas.width = this.baseCanvas.width;
    canvas.height = this.baseCanvas.height;
    this.drawArtwork(canvas);

    const link = document.createElement('a');
    link.download = 'wall-design.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  saveProject(): void {
    if (!this.auth.currentUser()) {
      this.projectMessage = 'Sign in to save projects to your account.';
      return;
    }
    if (!this.originalImage) {
      this.projectMessage = 'Upload a room photo before saving this project.';
      return;
    }
    if (!this.projectName.trim()) {
      this.projectMessage = 'Enter a name for this project.';
      return;
    }

    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = this.baseCanvas.width;
    originalCanvas.height = this.baseCanvas.height;
    const originalContext = originalCanvas.getContext('2d');
    if (!originalContext) {
      this.projectMessage = 'Could not prepare the original room image.';
      return;
    }

    originalContext.fillStyle = '#ffffff';
    originalContext.fillRect(0, 0, originalCanvas.width, originalCanvas.height);
    originalContext.drawImage(this.originalImage, 0, 0, originalCanvas.width, originalCanvas.height);

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = this.baseCanvas.width;
    finalCanvas.height = this.baseCanvas.height;
    this.drawArtwork(finalCanvas);

    const originalImageUrl = originalCanvas.toDataURL('image/jpeg', 0.78);
    const canvasImage = document.createElement('canvas');
    canvasImage.width = this.baseCanvas.width;
    canvasImage.height = this.baseCanvas.height;
    const canvasContext = canvasImage.getContext('2d');
    if (!canvasContext) {
      this.projectMessage = 'Could not prepare the editable room image.';
      return;
    }
    canvasContext.fillStyle = '#ffffff';
    canvasContext.fillRect(0, 0, canvasImage.width, canvasImage.height);
    canvasContext.drawImage(this.baseCanvas, 0, 0);
    const canvasImageUrl = canvasImage.toDataURL('image/jpeg', 0.78);
    const thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.width = 320;
    thumbnailCanvas.height = 160;
    const thumbnailContext = thumbnailCanvas.getContext('2d');
    if (!thumbnailContext) {
      this.projectMessage = 'Could not prepare the project thumbnail.';
      return;
    }
    thumbnailContext.drawImage(finalCanvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    const thumbnailUrl = thumbnailCanvas.toDataURL('image/jpeg', 0.62);
    if (originalImageUrl.length + canvasImageUrl.length > 9 * 1024 * 1024) {
      this.projectMessage = 'This image is too large to save. Try a smaller room photo.';
      return;
    }

    this.isSavingProject = true;
    this.projectMessage = '';
    this.projectService.save({
      projectName: this.projectName.trim(),
      originalImageUrl,
      canvasImageUrl,
      thumbnailUrl,
      selectedColor: this.selectedColor,
      selectedDesign: this.selectedDesign,
      polygons: this.polygons.map((polygon) => ({
        name: polygon.name,
        points: polygon.points.map((point) => ({ ...point })),
        color: polygon.color,
        opacity: polygon.opacity,
        finish: polygon.finish,
        design: polygon.design
      }))
    }).subscribe({
      next: ({ project }) => {
        this.savedProjects = [project, ...this.savedProjects];
        this.projectName = '';
        this.projectMessage = 'Project saved to your projects.';
        this.isSavingProject = false;
      },
      error: (error: HttpErrorResponse) => {
        this.projectMessage = error.error?.message ?? 'Could not save this project. Please try again.';
        this.isSavingProject = false;
      }
    });
  }

  loadProject(projectSummary: SavedProjectSummary): void {
    this.loadingProjectId = projectSummary.id;
    this.projectService.get(projectSummary.id).subscribe({
      next: ({ project }) => this.restoreProject(project),
      error: (error: HttpErrorResponse) => {
        this.loadingProjectId = null;
        this.projectMessage = error.error?.message ?? 'Could not open this saved project.';
      }
    });
  }

  private restoreProject(project: SavedProject): void {
    Promise.all([
      this.loadProjectImage(project.originalImageUrl),
      this.loadProjectImage(project.canvasImageUrl || project.originalImageUrl)
    ]).then(([originalImage, canvasImage]) => {
      const context = this.baseCanvas.getContext('2d');
      if (!context) {
        this.projectMessage = 'Could not open the saved project.';
        this.loadingProjectId = null;
        return;
      }

      context.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
      context.drawImage(canvasImage, 0, 0, this.baseCanvas.width, this.baseCanvas.height);
      this.originalImage = originalImage;
      this.originalImageUrl = project.originalImageUrl;
      this.selectedImageFile = null;
      this.polygons = project.polygons.map((polygon) => ({
        ...polygon,
        points: polygon.points.map((point) => ({ ...point }))
      }));
      this.selectedPolygonIndex = this.polygons.length > 0 ? 0 : -1;
      this.selectedColor = project.selectedColor ?? this.selectedPolygon?.color ?? '#464feb';
      this.selectedDesign = this.normalizeDesign(project.selectedDesign ?? this.selectedPolygon?.design);
      this.currentTool = 'brush';
      this.isEditingPolygon = false;
      this.projectName = project.projectName;
      this.projectMessage = `Opened "${project.projectName}".`;
      this.loadingProjectId = null;
      this.renderCanvas();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(() => {
      this.projectMessage = 'The saved original image could not be loaded.';
      this.loadingProjectId = null;
    });
  }

  private loadProjectImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Saved project image could not be loaded.'));
      image.src = source;
    });
  }

  deleteProject(project: SavedProjectSummary): void {
    this.projectService.delete(project.id).subscribe({
      next: () => {
        this.savedProjects = this.savedProjects.filter((saved) => saved.id !== project.id);
        this.projectMessage = `Deleted "${project.projectName}".`;
      },
      error: (error: HttpErrorResponse) => {
        this.projectMessage = error.error?.message ?? 'Could not delete this project.';
      }
    });
  }

  private loadSavedProjects(): void {
    this.isLoadingProjects = true;
    this.projectService.list().subscribe({
      next: ({ projects }) => {
        this.savedProjects = projects;
        this.isLoadingProjects = false;
      },
      error: (error: HttpErrorResponse) => {
        this.isLoadingProjects = false;
        if (error.status !== 401) {
          this.projectMessage = error.error?.message ?? 'Could not load your saved projects.';
        }
      }
    });
  }

  private lastBrushPoint: Point | null = null;

  private getCanvasPoint(event: PointerEvent): Point {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  private drawBrushStroke(from: Point, to: Point): void {
    const context = this.baseCanvas.getContext('2d');
    if (!context) {
      return;
    }

    context.save();
    context.globalCompositeOperation = this.currentTool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = this.selectedColor;
    context.fillStyle = this.selectedColor;
    context.lineWidth = this.currentTool === 'eraser' ? 24 : 16;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();

    this.lastBrushPoint = to;
    this.renderCanvas();
  }

  private findNearestVertex(point: Point, vertices: Point[]): number | null {
    const hitRadius = 24;
    let nearestIndex: number | null = null;
    let nearestDistance = hitRadius;

    vertices.forEach((vertex, index) => {
      const distance = Math.hypot(vertex.x - point.x, vertex.y - point.y);
      if (distance <= nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    return nearestIndex;
  }

  private saveUndoSnapshot(): void {
    const context = this.baseCanvas.getContext('2d');
    if (!context) {
      return;
    }

    this.undoSnapshot = {
      baseImage: context.getImageData(0, 0, this.baseCanvas.width, this.baseCanvas.height),
      polygons: this.polygons.map((polygon) => ({
        ...polygon,
        points: polygon.points.map((point) => ({ ...point }))
      })),
      selectedPolygonIndex: this.selectedPolygonIndex,
      originalImage: this.originalImage
    };
  }

  private renderCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    this.drawArtwork(canvas);

    if (this.selectedPolygon) {
      this.drawPolygonGuide(context, this.selectedPolygon.points, '#545be5', true, true);
    }
    if (this.draftPoints.length > 0) {
      const points = this.previewPoint
        ? [...this.draftPoints, this.previewPoint]
        : this.draftPoints;
      this.drawPolygonGuide(context, points, '#464feb', false, true);
    }
  }

  private drawArtwork(canvas: HTMLCanvasElement): void {
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(this.baseCanvas, 0, 0);

    for (const polygon of this.polygons) {
      if (polygon.points.length < 3) {
        continue;
      }

      context.save();
      context.globalAlpha = polygon.opacity;
      context.fillStyle = polygon.color;
      context.beginPath();
      context.moveTo(polygon.points[0].x, polygon.points[0].y);
      for (const point of polygon.points.slice(1)) {
        context.lineTo(point.x, point.y);
      }
      context.closePath();
      context.fill();
      context.restore();

      if (polygon.finish !== 'matte') {
        context.save();
        this.tracePolygon(context, polygon.points);
        context.clip();
        if (polygon.finish === 'satin' || polygon.finish === 'glossy') {
          const sheen = context.createLinearGradient(0, 0, canvas.width * 0.75, canvas.height);
          sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
          sheen.addColorStop(0.35, 'rgba(255,255,255,0.02)');
          sheen.addColorStop(0.68, polygon.finish === 'glossy' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.04)');
          sheen.addColorStop(1, 'rgba(20,20,30,0.08)');
          context.globalAlpha = polygon.finish === 'glossy' ? 0.55 : 0.35;
          context.fillStyle = sheen;
          context.fillRect(0, 0, canvas.width, canvas.height);
        } else if (polygon.finish === 'textured') {
          context.globalAlpha = 0.12;
          context.fillStyle = '#ffffff';
          for (let y = 8; y < canvas.height; y += 18) {
            for (let x = (y % 36 === 8 ? 8 : 17); x < canvas.width; x += 18) {
              context.beginPath();
              context.arc(x, y, 1.5, 0, Math.PI * 2);
              context.fill();
            }
          }
        }
        context.restore();
      }

      if (polygon.design !== 'none') {
        this.drawDesignPattern(context, canvas, polygon);
      }
    }
  }

  private drawDesignPattern(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    polygon: Polygon
  ): void {
    const tile = document.createElement('canvas');
    tile.width = 96;
    tile.height = 96;
    const tileContext = tile.getContext('2d');
    if (!tileContext) {
      return;
    }

    this.drawPatternTile(tileContext, polygon.design);
    const pattern = context.createPattern(tile, 'repeat');
    if (!pattern) {
      return;
    }

    context.save();
    this.tracePolygon(context, polygon.points);
    context.clip();
    context.globalAlpha = Math.min(0.72, Math.max(0.25, polygon.opacity + 0.15));
    context.fillStyle = pattern;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }

  private drawPatternTile(context: CanvasRenderingContext2D, design: DesignId): void {
    const theme = this.designs.find((item) => item.slug === design);
    const motif = theme?.motif ?? design;
    const accent = theme?.accentColor ?? '#ffffff';

    if (motif === 'geometric') {
      context.strokeStyle = `${accent}bb`;
      context.lineWidth = 3;
      for (let offset = -96; offset < 192; offset += 24) {
        context.beginPath();
        context.moveTo(offset, 0);
        context.lineTo(offset + 96, 96);
        context.stroke();
      }
      return;
    }

    if (motif === 'botanical') {
      context.strokeStyle = `${accent}99`;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(48, 96);
      context.quadraticCurveTo(49, 52, 48, 5);
      context.stroke();
      for (const side of [-1, 1]) {
        for (const y of [25, 50, 75]) {
          context.save();
          context.translate(48, y);
          context.scale(side, 1);
          context.fillStyle = `${accent}b8`;
          context.beginPath();
          context.moveTo(0, 0);
          context.quadraticCurveTo(5, -17, 27, -16);
          context.quadraticCurveTo(24, -1, 0, 0);
          context.fill();
          context.restore();
        }
      }
      return;
    }

    if (motif === 'halloween') {
      context.fillStyle = `${accent}d1`;
      context.beginPath();
      context.ellipse(48, 57, 22, 19, 0, 0, Math.PI * 2);
      context.ellipse(36, 57, 10, 15, 0, 0, Math.PI * 2);
      context.ellipse(60, 57, 10, 15, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#3d6534e6';
      context.fillRect(45, 33, 7, 8);
      context.fillStyle = '#ffdd81e6';
      for (const [x, y] of [[15, 16], [79, 22], [20, 80], [78, 84]]) {
        context.beginPath();
        context.moveTo(x, y - 5);
        context.lineTo(x + 1.5, y - 1.5);
        context.lineTo(x + 5, y);
        context.lineTo(x + 1.5, y + 1.5);
        context.lineTo(x, y + 5);
        context.lineTo(x - 1.5, y + 1.5);
        context.lineTo(x - 5, y);
        context.lineTo(x - 1.5, y - 1.5);
        context.closePath();
        context.fill();
      }
      return;
    }

    if (motif === 'vintage') {
      context.strokeStyle = `${accent}bf`;
      context.lineWidth = 2;
      for (const [x, y] of [[24, 24], [72, 24], [24, 72], [72, 72]]) {
        context.beginPath();
        context.arc(x, y, 13, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.moveTo(x - 7, y);
        context.lineTo(x + 7, y);
        context.moveTo(x, y - 7);
        context.lineTo(x, y + 7);
        context.stroke();
      }
      return;
    }

    if (motif === 'graffiti') {
      context.lineCap = 'round';
      context.lineWidth = 6;
      context.strokeStyle = `${accent}cc`;
      context.beginPath();
      context.moveTo(8, 74);
      context.lineTo(27, 24);
      context.lineTo(43, 65);
      context.lineTo(60, 18);
      context.lineTo(84, 60);
      context.stroke();
      context.fillStyle = `${accent}99`;
      context.beginPath();
      context.arc(18, 16, 4, 0, Math.PI * 2);
      context.arc(76, 82, 5, 0, Math.PI * 2);
      context.fill();
      return;
    }

    if (motif === 'gallery') {
      context.strokeStyle = `${accent}b0`;
      context.lineWidth = 3;
      for (const [x, y] of [[24, 25], [72, 25], [24, 72], [72, 72]]) {
        context.beginPath();
        context.moveTo(x - 13, y + 11);
        context.lineTo(x - 13, y - 2);
        context.arc(x, y - 2, 13, Math.PI, 0);
        context.lineTo(x + 13, y + 11);
        context.stroke();
      }
    }
  }

  private normalizeDesign(design: string | undefined): string {
    return !design || design === 'none' ? 'solid' : design;
  }

  private tracePolygon(context: CanvasRenderingContext2D, points: Point[]): void {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.closePath();
  }

  private drawPolygonGuide(
    context: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    closePath: boolean,
    showNumbers: boolean
  ): void {
    if (points.length === 0) {
      return;
    }

    context.save();
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.setLineDash(showNumbers ? [8, 5] : []);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    if (closePath && points.length > 2) {
      context.closePath();
    }
    context.stroke();
    context.setLineDash([]);

    const committedPoints = showNumbers && this.previewPoint
      ? points.slice(0, -1)
      : points;
    committedPoints.forEach((point, index) => {
      context.beginPath();
      context.arc(point.x, point.y, 11, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = '#ffffff';
      context.stroke();

      if (showNumbers) {
        context.fillStyle = '#ffffff';
        context.font = 'bold 12px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(String(index + 1), point.x, point.y);
      }
    });
    context.restore();
  }
}
