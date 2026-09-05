import { Component, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type SlotType = 'morning' | 'noon' | 'afternoon' | 'evening';

export interface ActivityLink {
  url: string;
  label?: string;
}

export interface Activity {
  id?: string;              // Optional runtime UUID
  title: string;           // Name of the activity
  subtitle?: string;       // Short subtitle
  description?: string;    // Detailed notes/details
  link?: string;           // Legacy single link
  links?: ActivityLink[];  // Multiple links with custom labels
  images?: string[];       // Array of image URLs
  cost?: number;           // Cost amount
  currency?: 'EUR' | 'GBP';// Currency
  isSplit?: boolean;       // Legacy flag (all costs are split 50/50)
}

export interface DayPlan {
  location?: string;       // e.g. 'Paris', 'London'
  slots: Record<SlotType, Activity[]>;
}

export interface GradientStop {
  color: string;
  offset: number;
}

export interface LocationPreset {
  name: string;
  gradientType?: 'linear' | 'radial';
  angle: number;
  stops: GradientStop[];
  borderColor?: string;
}

export interface TripData {
  title: string;
  startDate: string;       // e.g. '2027-06-08'
  icon?: string;           // e.g. '✈️'
  iconBgColor?: string;   // e.g. '#4f46e5'
  locations?: LocationPreset[];
  itinerary: DayPlan[];
}

export interface BudgetActivityItem {
  activity: Activity;
  dayIdx: number;
  slot: SlotType;
  dayDate: string;
}

export const DEFAULT_LOCATIONS: LocationPreset[] = [
  {
    name: 'Paris',
    gradientType: 'linear',
    angle: 90,
    stops: [
      { color: 'rgba(37, 99, 235, 0.25)', offset: 0 },
      { color: 'rgba(255, 255, 255, 0.95)', offset: 50 },
      { color: 'rgba(220, 38, 38, 0.25)', offset: 100 }
    ],
    borderColor: 'rgba(37, 99, 235, 0.35)'
  },
  {
    name: 'London',
    gradientType: 'linear',
    angle: 135,
    stops: [
      { color: 'rgba(30, 58, 138, 0.3)', offset: 0 },
      { color: 'rgba(255, 255, 255, 0.9)', offset: 30 },
      { color: 'rgba(225, 29, 72, 0.35)', offset: 50 },
      { color: 'rgba(255, 255, 255, 0.9)', offset: 70 },
      { color: 'rgba(30, 58, 138, 0.3)', offset: 100 }
    ],
    borderColor: 'rgba(30, 58, 138, 0.35)'
  },
  {
    name: 'Karlsruhe',
    gradientType: 'linear',
    angle: 180,
    stops: [
      { color: 'rgba(15, 23, 42, 0.2)', offset: 0 },
      { color: 'rgba(220, 38, 38, 0.2)', offset: 50 },
      { color: 'rgba(245, 158, 11, 0.25)', offset: 100 }
    ],
    borderColor: 'rgba(245, 158, 11, 0.35)'
  }
];

import sampleTripData from './sample-trip.json';

export const INITIAL_DATA: TripData = sampleTripData as TripData;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  
  @ViewChild('gridScrollContainer') set gridScrollContainer(el: ElementRef<HTMLDivElement> | undefined) {
    if (el?.nativeElement) {
      const container = el.nativeElement;
      container.addEventListener('wheel', (e: WheelEvent) => {
        if (container.scrollWidth > container.clientWidth) {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            container.scrollLeft += e.deltaY;
            e.preventDefault();
          }
        }
      }, { passive: false });
    }
  }

  readonly slotKeys: SlotType[] = ['morning', 'noon', 'afternoon', 'evening'];

  // Core Signals
  readonly tripData = signal<TripData>(JSON.parse(JSON.stringify(INITIAL_DATA)));
  readonly activeTab = signal<'plan' | 'budget'>('plan');
  readonly gbpToEurRate = signal<number>(1.17);
  readonly showMenu = signal<boolean>(false);
  readonly modalMode = signal<'closed' | 'view' | 'edit' | 'create'>('closed');
  readonly selectedActivity = signal<Activity | null>(null);
  
  // Target location for modal create / edit context
  readonly modalTargetDayIndex = signal<number>(0);
  readonly modalTargetSlot = signal<SlotType>('morning');

  // Title Inline Edit Signals
  readonly isEditingTitle = signal<boolean>(false);
  readonly titleInput = signal<string>('');
  readonly iconInput = signal<string>('');
  readonly iconBgColorInput = signal<string>('');

  startEditingTitle() {
    this.titleInput.set(this.tripData().title);
    this.iconInput.set(this.tripData().icon || '✈️');
    this.iconBgColorInput.set(this.tripData().iconBgColor || '#4f46e5');
    this.isEditingTitle.set(true);
  }

  saveTitle() {
    const newTitle = this.titleInput().trim();
    const newIcon = this.iconInput().trim() || '✈️';
    const newBg = this.iconBgColorInput() || '#4f46e5';
    if (newTitle) {
      const updated = { 
        ...this.tripData(), 
        title: newTitle,
        icon: newIcon,
        iconBgColor: newBg
      };
      this.tripData.set(updated);
    }
    this.isEditingTitle.set(false);
  }

  cancelEditingTitle() {
    this.isEditingTitle.set(false);
  }

  // Activity Links Helpers
  getActivityLinks(act: Activity): ActivityLink[] {
    if (act.links && act.links.length > 0) return act.links;
    if (act.link) return [{ url: act.link }];
    return [];
  }

  addLinkFormRow() {
    const current = this.editForm();
    this.editForm.set({
      ...current,
      links: [...current.links, { url: '', label: '' }]
    });
  }

  removeLinkFormRow(index: number) {
    const current = this.editForm();
    const updated = [...current.links];
    updated.splice(index, 1);
    this.editForm.set({
      ...current,
      links: updated
    });
  }

  updateLinkFormRow(index: number, field: 'url' | 'label', value: string) {
    const current = this.editForm();
    const updated = [...current.links];
    updated[index] = { ...updated[index], [field]: value };
    this.editForm.set({
      ...current,
      links: updated
    });
  }

  // Form State for Modal Edit/Create
  readonly editForm = signal<{
    id?: string;
    title: string;
    subtitle: string;
    description: string;
    links: ActivityLink[];
    imagesStr: string;
    cost: number | null;
    currency: 'EUR' | 'GBP';
  }>({
    title: '',
    subtitle: '',
    description: '',
    links: [],
    imagesStr: '',
    cost: null,
    currency: 'EUR'
  });

  // Undo System Cache
  readonly deletedCache = signal<{
    activity: Activity;
    dayIdx: number;
    slot: SlotType;
    index: number;
  } | null>(null);
  readonly deletedDayCache = signal<{
    day: DayPlan;
    index: number;
  } | null>(null);
  readonly activeDayMenuIndex = signal<number | null>(null);
  readonly locationModalOpen = signal<boolean>(false);
  readonly locationTargetDayIndex = signal<number>(-1);
  readonly editingLocation = signal<LocationPreset | null>(null);
  readonly showSnackbar = signal<boolean>(false);
  private snackbarTimer: any = null;

  // Drag and Drop active target tracking
  readonly dragOverTarget = signal<string | null>(null);
  private draggedSource: { dayIdx: number; slot: SlotType; index: number } | null = null;

  readonly showFreeActivities = signal<boolean>(false);

  // Computed Signal: Budget Activities (Iterates full tripData)
  readonly budgetActivities = computed<BudgetActivityItem[]>(() => {
    const trip = this.tripData();
    const includeFree = this.showFreeActivities();
    const result: BudgetActivityItem[] = [];

    trip.itinerary.forEach((day, dayIndex) => {
      const dayDate = this.formatDayDateStr(trip.startDate, dayIndex, day.location);
      for (const slotKey of this.slotKeys) {
        const activities = day.slots[slotKey] || [];
        for (const act of activities) {
          if (includeFree || (act.cost && act.cost > 0)) {
            result.push({
              activity: act,
              dayIdx: dayIndex,
              slot: slotKey,
              dayDate
            });
          }
        }
      }
    });

    return result;
  });

  // Computed Signal: Total EUR
  readonly totalEur = computed<number>(() => {
    const items = this.budgetActivities();
    const rate = this.gbpToEurRate();
    let sum = 0;

    for (const item of items) {
      const c = item.activity.cost || 0;
      const currency = item.activity.currency || 'EUR';
      const eurCost = currency === 'GBP' ? c * rate : c;
      sum += eurCost;
    }
    return Math.round(sum * 100) / 100;
  });

  // Computed Signal: Personal Share EUR (Always 50/50 split)
  readonly myShareEur = computed<number>(() => {
    return Math.round((this.totalEur() / 2) * 100) / 100;
  });

  // Slot helper functions
  getSlotActivities(day: DayPlan, slot: SlotType): Activity[] {
    return day.slots[slot] || [];
  }

  getSlotLabel(slot: SlotType): string {
    switch (slot) {
      case 'morning': return 'Vormittag';
      case 'noon': return 'Mittag';
      case 'afternoon': return 'Nachmittag';
      case 'evening': return 'Abend';
    }
  }

  getSlotIcon(slot: SlotType): string {
    switch (slot) {
      case 'morning': return '🌅';
      case 'noon': return '☀️';
      case 'afternoon': return '☕';
      case 'evening': return '🌙';
    }
  }

  formatDayHeaderParts(startDateIso: string, dayIndex: number, location?: string): { weekday: string; date: string; location: string } {
    if (!startDateIso) {
      return { weekday: `Tag ${dayIndex + 1}`, date: '', location: location || '' };
    }
    const [y, m, d] = startDateIso.split('-').map(Number);
    const curDate = new Date(y, m - 1, d + dayIndex);

    const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

    return {
      weekday: weekdays[curDate.getDay()],
      date: `${String(curDate.getDate()).padStart(2, '0')}. ${months[curDate.getMonth()]}`,
      location: location || ''
    };
  }

  formatDayDateStr(startDateIso: string, dayIndex: number, location?: string): string {
    const parts = this.formatDayHeaderParts(startDateIso, dayIndex, location);
    const locStr = parts.location ? ` (${parts.location})` : '';
    return `${parts.weekday}, ${parts.date}${locStr}`;
  }

  getLocationsList(): LocationPreset[] {
    const trip = this.tripData();
    if (trip.locations && trip.locations.length > 0) {
      return trip.locations;
    }
    return DEFAULT_LOCATIONS;
  }

  buildGradientCss(preset: LocationPreset): string {
    const stops = (preset.stops || [])
      .slice()
      .sort((a, b) => a.offset - b.offset);
    const stopsCss = stops.map(s => `${s.color} ${s.offset}%`).join(', ');
    
    if (preset.gradientType === 'radial') {
      return `radial-gradient(circle, ${stopsCss})`;
    }
    return `linear-gradient(${preset.angle || 90}deg, ${stopsCss})`;
  }

  getHeaderStyle(location: string): Record<string, string> {
    const locStr = (location || '').trim().toLowerCase();
    if (!locStr) {
      return { 'background': '#ffffff', 'border-color': '#e2e8f0' };
    }

    const presets = this.getLocationsList();
    const matched = presets.find(p => p.name.trim().toLowerCase() === locStr);

    if (matched) {
      return {
        'background': this.buildGradientCss(matched),
        'border-color': matched.borderColor || '#e2e8f0'
      };
    }

    return {
      'background': '#ffffff',
      'border-color': '#e2e8f0'
    };
  }

  // --- DRAG AND DROP ---
  onDragStart(event: DragEvent, dayIdx: number, slot: SlotType, index: number) {
    this.draggedSource = { dayIdx, slot, index };
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent, dayIdx: number, slot: SlotType) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverTarget.set(`${dayIdx}-${slot}`);
  }

  onDragLeave(event: DragEvent, dayIdx: number, slot: SlotType) {
    if (this.dragOverTarget() === `${dayIdx}-${slot}`) {
      this.dragOverTarget.set(null);
    }
  }

  onDrop(event: DragEvent, targetDayIdx: number, targetSlot: SlotType) {
    event.preventDefault();
    this.dragOverTarget.set(null);

    if (!this.draggedSource) return;
    const { dayIdx: srcDayIdx, slot: srcSlot, index: srcIndex } = this.draggedSource;
    this.draggedSource = null;

    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    const srcDay = updated.itinerary[srcDayIdx];
    const tgtDay = updated.itinerary[targetDayIdx];

    if (!srcDay || !tgtDay) return;

    const sourceList = srcDay.slots[srcSlot];
    if (srcIndex < 0 || srcIndex >= sourceList.length) return;

    const [movedItem] = sourceList.splice(srcIndex, 1);
    tgtDay.slots[targetSlot].push(movedItem);

    this.tripData.set(updated);
  }

  // --- MODAL CONTROLS ---
  readonly viewPopoverRect = signal<{top: number; left: number; width: number; height: number} | null>(null);

  openViewModal(activity: Activity, dayIdx: number, slot: SlotType, event?: MouseEvent) {
    if (event) {
      const el = (event.currentTarget as HTMLElement);
      const rect = el.getBoundingClientRect();
      this.viewPopoverRect.set({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    } else {
      this.viewPopoverRect.set(null);
    }
    this.selectedActivity.set(activity);
    this.modalTargetDayIndex.set(dayIdx);
    this.modalTargetSlot.set(slot);
    this.modalMode.set('view');
  }

  /**
   * Computes a viewport-aware CSS style object for the view popover card.
   * Tries to open to the right of the clicked card; falls back to left if needed.
   * Vertically: opens downward when space allows, flips upward before ever scrolling.
   */
  getPopoverStyle(rect: {top: number; left: number; width: number; height: number} | null): { [key: string]: string } {
    const POPOVER_WIDTH = 420;
    const MAX_H = 520;   // estimated max content height
    const MARGIN = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!rect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }

    // ── Horizontal ──────────────────────────────────────────────────────────
    let left = rect.left + rect.width + MARGIN;
    if (left + POPOVER_WIDTH > vw - MARGIN) {
      left = rect.left - POPOVER_WIDTH - MARGIN;
    }
    left = Math.max(MARGIN, Math.min(left, vw - POPOVER_WIDTH - MARGIN));

    // ── Vertical ─────────────────────────────────────────────────────────────
    const cardBottom = rect.top + rect.height;
    const spaceBelow = vh - rect.top - MARGIN;  // px available if opening downward from card top
    const spaceAbove = cardBottom - MARGIN;     // px available if opening upward from card bottom

    const leftPx = `${left}px`;
    const widthPx = '420px';

    if (spaceBelow >= MAX_H) {
      // ① Plenty of room below → open downward, bottom set by content
      return { top: `${rect.top}px`, left: leftPx, width: widthPx, 'max-height': `${MAX_H}px`, 'overflow-y': 'hidden' };
    }

    if (spaceAbove >= MAX_H) {
      // ② Not enough below but enough above → anchor bottom of popover to card bottom
      // Using CSS `bottom` so the popover's bottom edge always hugs the card regardless of content height.
      const cssBottom = vh - cardBottom;
      return { bottom: `${cssBottom}px`, left: leftPx, width: widthPx, 'max-height': `${MAX_H}px`, 'overflow-y': 'hidden' };
    }

    if (spaceBelow >= spaceAbove) {
      // ③ More room below than above, but neither fits MAX_H → downward with scroll
      return { top: `${rect.top}px`, left: leftPx, width: widthPx, 'max-height': `${spaceBelow}px`, 'overflow-y': 'auto' };
    }

    // ④ More room above → upward with scroll
    const cssBottom = vh - cardBottom;
    return { bottom: `${cssBottom}px`, left: leftPx, width: widthPx, 'max-height': `${spaceAbove}px`, 'overflow-y': 'auto' };
  }

  openEditModal(activity?: Activity, dayIdx?: number, slot?: SlotType) {
    const targetAct = activity || this.selectedActivity();
    if (!targetAct) return;

    if (!targetAct.id) {
      targetAct.id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'act-' + Date.now();
    }

    if (dayIdx !== undefined) this.modalTargetDayIndex.set(dayIdx);
    if (slot) this.modalTargetSlot.set(slot);

    const linksList = this.getActivityLinks(targetAct).map(l => ({ url: l.url, label: l.label || '' }));

    this.selectedActivity.set(targetAct);
    this.editForm.set({
      id: targetAct.id,
      title: targetAct.title || '',
      subtitle: targetAct.subtitle || '',
      description: targetAct.description || '',
      links: linksList,
      imagesStr: (targetAct.images || []).join('\n'),
      cost: targetAct.cost !== undefined ? targetAct.cost : null,
      currency: targetAct.currency || 'EUR'
    });
    this.modalMode.set('edit');
  }

  openCreateModal(dayIdx: number, slot: SlotType) {
    this.selectedActivity.set(null);
    this.modalTargetDayIndex.set(dayIdx);
    this.modalTargetSlot.set(slot);
    this.editForm.set({
      id: undefined,
      title: '',
      subtitle: '',
      description: '',
      links: [],
      imagesStr: '',
      cost: null,
      currency: 'EUR'
    });
    this.modalMode.set('create');
  }

  closeModal() {
    this.modalMode.set('closed');
    this.selectedActivity.set(null);
  }

  saveModalActivity() {
    const form = this.editForm();
    if (!form.title.trim()) return;

    const imagesArray = form.imagesStr
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const cleanedLinks = form.links
      .map(l => ({ url: l.url.trim(), label: l.label ? l.label.trim() : undefined }))
      .filter(l => l.url.length > 0);

    const actId = form.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'act-' + Date.now());

    const activityData: Activity = {
      id: actId,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      description: form.description.trim() || undefined,
      links: cleanedLinks.length > 0 ? cleanedLinks : undefined,
      images: imagesArray.length > 0 ? imagesArray : undefined,
      cost: form.cost !== null && form.cost > 0 ? Number(form.cost) : undefined,
      currency: form.currency
    };

    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    const targetDayIdx = this.modalTargetDayIndex();
    const targetSlot = this.modalTargetSlot();
    const originalAct = this.selectedActivity();

    const day = updated.itinerary[targetDayIdx];
    if (day) {
      if (this.modalMode() === 'edit') {
        let replaced = false;

        // 1. Check target slot first by id or original title
        const slotList = day.slots[targetSlot];
        const index = slotList.findIndex(a => 
          (a.id && a.id === actId) || 
          (originalAct?.id && a.id === originalAct.id) || 
          (originalAct?.title && a.title === originalAct.title)
        );

        if (index >= 0) {
          slotList[index] = activityData;
          replaced = true;
        } else {
          // 2. Check all slots in target day
          for (const s of this.slotKeys) {
            const idx = day.slots[s].findIndex(a => 
              (a.id && a.id === actId) || 
              (originalAct?.id && a.id === originalAct.id) || 
              (originalAct?.title && a.title === originalAct.title)
            );
            if (idx >= 0) {
              day.slots[s][idx] = activityData;
              replaced = true;
              break;
            }
          }
        }

        // 3. Check all slots in full itinerary
        if (!replaced) {
          for (const d of updated.itinerary) {
            for (const s of this.slotKeys) {
              const idx = d.slots[s].findIndex(a => 
                (a.id && a.id === actId) || 
                (originalAct?.id && a.id === originalAct.id) || 
                (originalAct?.title && a.title === originalAct.title)
              );
              if (idx >= 0) {
                d.slots[s][idx] = activityData;
                replaced = true;
                break;
              }
            }
            if (replaced) break;
          }
        }

        // 4. Fallback if not found anywhere: push to target slot
        if (!replaced) {
          day.slots[targetSlot].push(activityData);
        }
      } else {
        // Mode is 'create'
        day.slots[targetSlot].push(activityData);
      }

      this.tripData.set(updated);
    }

    this.closeModal();
  }

  // --- DELETE & UNDO LOGIC ---
  deleteActivity(activity: Activity, dayIdx: number, slot: SlotType, event?: MouseEvent) {
    if (event) event.stopPropagation();

    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    const day = updated.itinerary[dayIdx];
    if (!day) return;

    const list = day.slots[slot];
    const index = list.findIndex(a => (a.id && activity.id ? a.id === activity.id : a.title === activity.title));
    if (index < 0) return;

    const [deleted] = list.splice(index, 1);
    this.deletedCache.set({ activity: deleted, dayIdx, slot, index });
    this.deletedDayCache.set(null);
    this.showSnackbar.set(true);

    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
    this.snackbarTimer = setTimeout(() => {
      this.showSnackbar.set(false);
    }, 5000);

    this.tripData.set(updated);
    if (this.modalMode() !== 'closed') {
      this.closeModal();
    }
  }

  undoDelete() {
    const cache = this.deletedCache();
    if (!cache) return;

    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    const day = updated.itinerary[cache.dayIdx];
    if (day) {
      const list = day.slots[cache.slot];
      list.splice(cache.index, 0, cache.activity);
      this.tripData.set(updated);
    }

    this.deletedCache.set(null);
    this.showSnackbar.set(false);
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
  }

  // --- DIRECT BUDGET TRACKER EDITS ---
  updateActivityCost(item: BudgetActivityItem, newCost: number) {
    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    const day = updated.itinerary[item.dayIdx];
    if (day) {
      const act = day.slots[item.slot].find(a => (a.id && item.activity.id ? a.id === item.activity.id : a.title === item.activity.title));
      if (act) {
        act.cost = newCost > 0 ? Number(newCost) : 0;
        this.tripData.set(updated);
      }
    }
  }

  updateActivityCurrency(item: BudgetActivityItem, currency: 'EUR' | 'GBP') {
    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    const day = updated.itinerary[item.dayIdx];
    if (day) {
      const act = day.slots[item.slot].find(a => (a.id && item.activity.id ? a.id === item.activity.id : a.title === item.activity.title));
      if (act) {
        act.currency = currency;
        this.tripData.set(updated);
      }
    }
  }

  // Personal Share calculation helper (Always 50% split)
  calcPersonalShareEur(item: BudgetActivityItem): number {
    const cost = item.activity.cost || 0;
    const currency = item.activity.currency || 'EUR';
    const eurCost = currency === 'GBP' ? cost * this.gbpToEurRate() : cost;
    return Math.round((eurCost / 2) * 100) / 100;
  }

  // --- JSON IMPORT / EXPORT ---
  exportJson() {
    const dataStr = JSON.stringify(this.tripData(), null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reiseplan-${this.tripData().title.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  triggerImport() {
    if (this.fileInput) {
      this.fileInput.nativeElement.click();
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json && json.title && Array.isArray(json.itinerary)) {
          if (!json.startDate) json.startDate = '2027-06-08';
          this.tripData.set(json);
        } else {
          alert('Ungültiges JSON-Format. Das JSON muss eine "title" und ein "itinerary"-Array enthalten.');
        }
      } catch (err) {
        alert('Fehler beim Parsen der JSON-Datei.');
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  openDatePicker(input: HTMLInputElement) {
    if (input) {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.click();
      }
    }
  }

  onStartDateChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input && input.value) {
      this.updateStartDate(input.value);
    }
  }

  updateStartDate(dateIsoStr: string) {
    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    updated.startDate = dateIsoStr;
    this.tripData.set(updated);
    this.activeDayMenuIndex.set(null);
  }

  toggleDayMenu(dayIdx: number, event: MouseEvent) {
    event.stopPropagation();
    if (this.activeDayMenuIndex() === dayIdx) {
      this.activeDayMenuIndex.set(null);
    } else {
      this.activeDayMenuIndex.set(dayIdx);
    }
  }

  // --- DAY LOCATION MODAL & BACKGROUND EDITOR ---
  openLocationModal(dayIdx: number) {
    this.locationTargetDayIndex.set(dayIdx);
    this.editingLocation.set(null);
    this.locationModalOpen.set(true);
    this.activeDayMenuIndex.set(null);
  }

  closeLocationModal() {
    this.locationModalOpen.set(false);
    this.locationTargetDayIndex.set(-1);
    this.editingLocation.set(null);
  }

  isLocationSelectedForDay(locName: string): boolean {
    const targetIdx = this.locationTargetDayIndex();
    if (targetIdx < 0) return false;
    const day = this.tripData().itinerary[targetIdx];
    const currentLoc = (day?.location || '').trim().toLowerCase();
    const targetLoc = (locName || '').trim().toLowerCase();
    return currentLoc === targetLoc;
  }

  selectLocationForDay(locName: string) {
    const targetIdx = this.locationTargetDayIndex();
    if (targetIdx < 0) return;

    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    const day = updated.itinerary[targetIdx];
    if (day) {
      day.location = locName;
      this.tripData.set(updated);
    }
    this.closeLocationModal();
  }

  openLocationEditor(preset?: LocationPreset) {
    if (preset) {
      this.editingLocation.set(JSON.parse(JSON.stringify(preset)));
    } else {
      const newPreset: LocationPreset = {
        name: 'Neuer Ort',
        gradientType: 'linear',
        angle: 90,
        stops: [
          { color: '#3b82f6', offset: 0 },
          { color: '#ffffff', offset: 50 },
          { color: '#ec4899', offset: 100 }
        ],
        borderColor: '#3b82f6'
      };
      this.editingLocation.set(newPreset);
    }
  }

  closeLocationEditor() {
    this.editingLocation.set(null);
  }

  addGradientStop() {
    const editing = this.editingLocation();
    if (!editing) return;

    const stops = [...editing.stops];
    const lastStop = stops[stops.length - 1] || { color: '#3b82f6', offset: 50 };
    const newOffset = Math.min(100, Math.round((lastStop.offset + 100) / 2));
    stops.push({ color: '#ec4899', offset: newOffset });

    this.editingLocation.set({
      ...editing,
      stops
    });
  }

  removeGradientStop(index: number) {
    const editing = this.editingLocation();
    if (!editing || editing.stops.length <= 2) return;

    const stops = editing.stops.filter((_, i) => i !== index);
    this.editingLocation.set({
      ...editing,
      stops
    });
  }

  updateEditingStopColor(index: number, color: string) {
    const editing = this.editingLocation();
    if (!editing) return;

    const stops = [...editing.stops];
    stops[index] = { ...stops[index], color };
    this.editingLocation.set({ ...editing, stops });
  }

  updateEditingStopOffset(index: number, offset: number) {
    const editing = this.editingLocation();
    if (!editing) return;

    const stops = [...editing.stops];
    stops[index] = { ...stops[index], offset: Number(offset) };
    this.editingLocation.set({ ...editing, stops });
  }

  saveLocationPreset() {
    const editing = this.editingLocation();
    if (!editing || !editing.name.trim()) return;

    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    const locs: LocationPreset[] = updated.locations && updated.locations.length > 0 
      ? updated.locations 
      : JSON.parse(JSON.stringify(DEFAULT_LOCATIONS));

    const index = locs.findIndex(l => l.name.trim().toLowerCase() === editing.name.trim().toLowerCase());
    if (index >= 0) {
      locs[index] = editing;
    } else {
      locs.push(editing);
    }
    updated.locations = locs;

    this.tripData.set(updated);
    
    // Automatically select this location for active target day
    if (this.locationTargetDayIndex() >= 0) {
      const day = updated.itinerary[this.locationTargetDayIndex()];
      if (day) {
        day.location = editing.name;
        this.tripData.set(updated);
      }
    }

    this.editingLocation.set(null);
  }

  deleteLocationPreset(name: string, event: MouseEvent) {
    event.stopPropagation();
    const list = this.getLocationsList();
    if (list.length <= 1) {
      alert('Es muss mindestens 1 Ort in der Liste verbleiben.');
      return;
    }

    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    const locs: LocationPreset[] = updated.locations && updated.locations.length > 0 
      ? updated.locations 
      : JSON.parse(JSON.stringify(DEFAULT_LOCATIONS));

    updated.locations = locs.filter(l => l.name.trim().toLowerCase() !== name.trim().toLowerCase());
    this.tripData.set(updated);
  }

  // --- DAY MANAGEMENT (ADD / REMOVE DAY) ---
  addDay() {
    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    const lastDay = updated.itinerary[updated.itinerary.length - 1];
    const newLocation = lastDay?.location || '';

    const newDay: DayPlan = {
      location: newLocation,
      slots: {
        morning: [],
        noon: [],
        afternoon: [],
        evening: []
      }
    };

    updated.itinerary.push(newDay);
    this.tripData.set(updated);
    this.activeDayMenuIndex.set(null);
  }

  removeLastDay() {
    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    if (updated.itinerary.length <= 1) {
      alert('Die Reise muss mindestens 1 Tag enthalten.');
      return;
    }

    const removedIndex = updated.itinerary.length - 1;
    const removedDay = updated.itinerary.pop();

    if (removedDay) {
      this.deletedDayCache.set({
        day: removedDay,
        index: removedIndex
      });
      this.deletedCache.set(null);
      this.showSnackbar.set(true);

      if (this.snackbarTimer) {
        clearTimeout(this.snackbarTimer);
      }
      this.snackbarTimer = setTimeout(() => {
        this.showSnackbar.set(false);
      }, 5000);
    }

    this.tripData.set(updated);
    this.activeDayMenuIndex.set(null);
  }

  undoDeleteDay() {
    const cache = this.deletedDayCache();
    if (!cache) return;

    const updated = JSON.parse(JSON.stringify(this.tripData())) as TripData;
    updated.itinerary.splice(cache.index, 0, cache.day);

    this.tripData.set(updated);
    this.deletedDayCache.set(null);
    this.showSnackbar.set(false);
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
  }

  resetToDefault() {
    if (confirm('Möchtest du die Reisedaten auf den ursprünglichen Paris & London Plan zurücksetzen?')) {
      this.tripData.set(JSON.parse(JSON.stringify(INITIAL_DATA)));
    }
  }
}
