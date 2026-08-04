import { CurvePath, Vector2, Vector3, Curve, LineCurve, LineCurve3 } from "three";

const DEFAULT_PATH_COUNT = 30;
const DEFAULT_MIN_TIME = 1;
const DEFAULT_MAX_TIME = 3;

/**
 * Represents a movement with paths and timings.
 */
export class Movement {
  /**
   * The paths of the movement.
   */
  private _paths: CurvePath<Vector3> = new CurvePath<Vector3>();

  /**
   * The timings of the movement. Each curve should be a curve with x as time in seconds and y as percentage (1.0 = 100%).
   */
  private _timings: Curve<Vector2>[] = [];

  /**
   * The total time of the movement.
   */
  public totalTime: number = 0;

  /**
   * The origin of the movement.
   */
  public origin: Vector3 = new Vector3();

  /**
   * Indicates whether the paths are closed.
   */
  public closed: boolean = false;

  /**
   * Indicates whether the movement should loop.
   */
  public loop: boolean = true;

  /**
   * Indicates whether the movement is finished.
   */
  public finished: boolean = false;

  /**
   * The maximum random distance from the origin of the movement.
   */
  public maxDist: number = 0.3;

  public isStationary: boolean = false;

  /**
   * Creates a new instance of the Movement class.
   * @param paths The paths of the movement.
   * @param timings The timings of the movement.
   * @param origin The origin of the movement.
   * @param closed Indicates whether the paths should be automatically closed.
   * @param loop Indicates whether the movement should loop.
   * @param maxDist The maximum random distance from the origin of the movement.
   */
  constructor({ paths, timings, origin, closed, loop, dof: maxDist }: { paths?: CurvePath<Vector3> | Vector3[]; timings?: Curve<Vector2>[]; origin?: Vector3; closed?: boolean; loop?: boolean; dof?: number } = {}) {
    // Before the paths, not after: addRandomPath reads maxDist, so assigning
    // it later left every generated walk bounded by the default instead of by
    // the dof the caller asked for.
    if (maxDist) {
      this.maxDist = maxDist;
    }

    if (paths instanceof CurvePath || Array.isArray(paths)) {
      this.paths = paths;
    } else {
      for (let i = 0; i < Movement.DEFAULT_PATH_COUNT; i++) {
        this.addRandomPath();
      }
      this.closePath();
    }

    if (timings) {
      this.timings = timings;
    }

    if (origin) {
      this.origin.copy(origin);
    }

    if (closed && !this.closed) {
      this.closePath();
      this.closed = closed;
    }

    if (loop !== undefined) {
      this.loop = loop;
    }
  }

  /**
   * Gets the default path count 10.
   */
  static get DEFAULT_PATH_COUNT(): number {
    return DEFAULT_PATH_COUNT;
  }

  /**
   * Gets the default minimum time 1 second.
   */
  static get DEFAULT_MIN_TIME(): number {
    return DEFAULT_MIN_TIME;
  }

  /**
   * Gets the default maximum time 5 seconds.
   */
  static get DEFAULT_MAX_TIME(): number {
    return DEFAULT_MAX_TIME;
  }

  /**
   * Sets the paths of the movement.
   * @param paths The paths to set.
   * @throws Error if the path type is invalid.
   */
  set paths(paths: CurvePath<Vector3> | Vector3[]) {
    if (paths instanceof CurvePath) {
      this._paths.copy(paths);

      this.validate();
      return;
    }

    if (Array.isArray(paths)) {
      for (let i = 0; i < paths.length - 1; i++) {
        this._paths.add(new LineCurve3(paths[i], paths[i + 1]));
      }

      this.validate();
      return;
    }

    throw new Error("Invalid path type");
  }

  /**
   * Gets the paths of the movement.
   * @returns The paths of the movement.
   */
  get paths(): CurvePath<Vector3> {
    return this._paths;
  }

  /**
   * Sets the timings of the movement. Each curve should be a curve with x as time in seconds and y as percentage (1.0 = 100%).
   * @param timings The timings to set.
   */
  set timings(timings: Curve<Vector2>[]) {
    this._timings = timings;
    this.totalTime = 0;
    this.totalTime = timings.reduce((total, curve) => total + curve.getPoint(1).x, 0);

    this.validate();
  }

  /**
   * Gets the timings of the movement.
   * @returns The timings of the movement.
   */
  get timings(): Curve<Vector2>[] {
    return this._timings;
  }

  /**
   * Adds a path to the movement.
   * @param path The path to add.
   * @throws Error if the path type is invalid.
   */
  add(path: Curve<Vector3> | Vector3): Movement {
    if (path instanceof Curve) {
      this._paths.add(path);

      this.validate();
      return this;
    }

    if (path instanceof Vector3) {
      if (this._paths.curves.length > 0) {
        this._paths.add(new LineCurve3(this._paths.curves[this._paths.curves.length - 1].getPoint(1), path));
      } else {
        this._paths.add(new LineCurve3(new Vector3(), path));
      }

      this.validate();
      return this;
    }

    throw new Error("Invalid path type");
  }

  /**
   * Adds multiple paths to the movement.
   * @param paths The paths to add.
   * @throws Error if the paths type is invalid.
   */
  addPaths(paths: CurvePath<Vector3> | Vector3[]): Movement {
    if (paths instanceof CurvePath) {
      for (const curve of paths.curves) {
        this.add(curve);
      }
      return this;
    }

    if (Array.isArray(paths)) {
      for (const point of paths) {
        this.add(point);
      }
      return this;
    }

    throw new Error("Invalid paths type");
  }

  /**
   * Adds a random path to the movement.
   */
  addRandomPath(): Movement {
    this.add(new Vector3().randomDirection().multiplyScalar(Math.random() * this.maxDist));
    return this;
  }

  /**
   * Removes a path from the movement.
   * @param index The index of the path to remove.
   * @throws Error if the index is invalid.
   */
  remove(index?: number): Curve<Vector3> | undefined {
    if (index === undefined) {
      const removed = this._paths.curves.pop();
      this.validate();
      return removed;
    }

    if (!Number.isNaN(index) && index >= 0 && index < this._paths.curves.length) {
      const removed = this._paths.curves.splice(index, 1);
      this.validate();
      return removed[0];
    }

    throw new Error("Invalid index: " + index);
  }

  /**
   * Removes a range of paths from the movement.
   * @param start The start index of the range.
   * @param end The end index of the range.
   */
  removeRange(start: number, end?: number): Curve<Vector3>[] | undefined {
    const removed: Curve<Vector3>[] = [];
    // Back to front: removing shifts every later index down, so walking
    // forwards skipped one segment for each one it took out.
    for (let i = (end ?? this._paths.curves.length) - 1; i >= start; i--) {
      const temp = this.remove(i);
      if (temp) {
        removed.push(temp);
      }
    }
    return removed.reverse();
  }

  /**
   * Add a final path to the start of the movement.
   */
  closePath(): Movement {
    if (!this.closed) {
      this._paths.closePath();
      this.closed = true;
      this.validate();
    }
    return this;
  }

  /**
   * Gets the current point of the movement at the specified time.
   * @param time The time (in seconds) to get the current point at.
   * @returns The current point of the movement.
   */
  getCurrentPoint(time: number): Vector3 {
    if (this.totalTime === 0) {
      return new Vector3().add(this.origin);
    }

    if ((!this.loop && (this.finished || time > this.totalTime)) || time === this.totalTime) {
      this.finished = true;
      if (this._paths.autoClose) {
        return this._paths.curves[0].getPointAt(0);
      }
      return this._paths.curves[this._paths.curves.length - 1].getPointAt(1);
    }

    let segment = 0;
    let segmentTime = time % this.totalTime;
    let currentTiming = this._timings[segment];

    while (segmentTime > currentTiming.getPoint(1).x) {
      segmentTime -= currentTiming.getPoint(1).x;
      currentTiming = this._timings[++segment];
    }

    let param = currentTiming.getPoint(segmentTime / currentTiming.getPoint(1).x).y;

    return this.origin.clone().add(this._paths.curves[segment].getPointAt(param));
  }

  /**
   * Sets the movement to be stationary.
   * @returns This object.
   */
  stationary(): Movement {
    this.paths = new CurvePath<Vector3>();
    this.timings = [];
    this.isStationary = true;
    return this.add(new Vector3());
  }

  /**
   * Validates the movement by adjusting the timings if necessary.
   */
  validate() {
    if (this._paths.curves.length < this._timings.length) {
      for (let i = this._paths.curves.length; i < this._timings.length; i++) {
        let temp = this._timings.pop();
        if (temp) {
          this.totalTime -= temp.getPoint(1).x;
        }
      }
    } else if (this._paths.curves.length > this._timings.length) {
      for (let i = this._timings.length; i < this._paths.curves.length; i++) {
        const time = Movement.DEFAULT_MIN_TIME + (Movement.DEFAULT_MAX_TIME - Movement.DEFAULT_MIN_TIME) * Math.random();
        this._timings.push(new LineCurve(
          new Vector2(),
          new Vector2(time, 1)
        ));
        this.totalTime += time;
      }
    }
  }
}