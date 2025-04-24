/**
 * Reorders the elements in `arr` between indices `start` and `end` (inclusive) so that the
 * element at index `n` is the same as it would be if that subarray were fully sorted. All
 * elements before index `n` in the subarray are <= arr[n] and all elements after are >= arr[n].
 * Operates in average O(n) time using the Quickselect algorithm.
 *
 * @param arr - The array to partially sort in place.
 * @param n - The pivot index (0-based) within the full array that should be placed correctly.
 * @param start - The starting index (0-based) of the subarray to consider. Defaults to 0.
 * @param end - The ending index (0-based) of the subarray to consider. Defaults to arr.length - 1.
 * @param compare - Optional comparison function returning negative if a<b, zero if equal, positive if a>b.
 *
 * @throws {RangeError} If `n`, `start`, or `end` are out of bounds or if start > end.
 */
export function nthElement<T>(
    arr: T[],
    n: number,
    start = 0,
    end = arr.length - 1,
    compare: (a: T, b: T) => number = (a, b) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    }
  ): void {
    // Validate indices
    if (start < 0 || end >= arr.length || start > end) {
      throw new RangeError(`Invalid range [${start}, ${end}] for array of length ${arr.length}`);
    }
    if (n < start || n > end) {
      throw new RangeError(`n (${n}) is out of bounds for specified range [${start}, ${end}]`);
    }
  
    function swap(i: number, j: number) {
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  
    function partition(left: number, right: number, pivotIndex: number): number {
      const pivotValue = arr[pivotIndex];
      swap(pivotIndex, right);
      let storeIndex = left;
  
      for (let i = left; i < right; i++) {
        if (compare(arr[i], pivotValue) < 0) {
          swap(i, storeIndex);
          storeIndex++;
        }
      }
  
      swap(storeIndex, right);
      return storeIndex;
    }
  
    function quickselect(left: number, right: number, k: number): void {
      if (left === right) return;
  
      // Choose a random pivot index between left and right
      const pivotIndex = left + Math.floor(Math.random() * (right - left + 1));
      const pivotNewIndex = partition(left, right, pivotIndex);
  
      if (k === pivotNewIndex) {
        return;
      } else if (k < pivotNewIndex) {
        quickselect(left, pivotNewIndex - 1, k);
      } else {
        quickselect(pivotNewIndex + 1, right, k);
      }
    }
  
    // Run Quickselect on the specified subarray
    quickselect(start, end, n);
  }
  