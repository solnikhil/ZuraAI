/**
 * Fixed, main-owned MSAA bridge used when UI Automation exposes no actionable
 * descendants. The model/renderer never supplies code to this helper.
 */
export const LEGACY_ACCESSIBILITY_HELPER = String.raw`
Add-Type -AssemblyName Accessibility
Add-Type -AssemblyName System.Windows.Forms
if (-not ('ZuraLegacyAccessibility' -as [type])) {
Add-Type -ReferencedAssemblies @('Accessibility', 'System.Windows.Forms') -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Accessibility;
using System.Windows.Forms;

public sealed class ZuraLegacyNode {
  public string runtimeId { get; set; }
  public string parentRuntimeId { get; set; }
  public string name { get; set; }
  public string value { get; set; }
  public string controlType { get; set; }
  public string className { get; set; }
  public bool enabled { get; set; }
  public bool focused { get; set; }
  public bool selected { get; set; }
  public bool visible { get; set; }
  public object bounds { get; set; }
  public string[] supportedPatterns { get; set; }
  public string source { get; set; }
}

public static class ZuraLegacyAccessibility {
  private const uint OBJID_CLIENT = 0xFFFFFFFC;
  private const int CHILDID_SELF = 0;

  [DllImport("oleacc.dll")]
  private static extern int AccessibleObjectFromWindow(
    IntPtr hwnd,
    uint objectId,
    ref Guid interfaceId,
    [MarshalAs(UnmanagedType.Interface)] out object accessible);

  [DllImport("oleacc.dll")]
  private static extern int AccessibleChildren(
    [MarshalAs(UnmanagedType.Interface)] object container,
    int childStart,
    int childCount,
    [Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 2)] object[] children,
    out int obtained);

  private sealed class Target {
    public IAccessible accessible;
    public object childId;
    public IAccessible childObject;
  }

  private static IAccessible Root(long hwnd) {
    Guid iid = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");
    object value;
    int hr = AccessibleObjectFromWindow(new IntPtr(hwnd), OBJID_CLIENT, ref iid, out value);
    if (hr < 0 || value == null) return null;
    return value as IAccessible;
  }

  private static List<Target> Children(IAccessible container) {
    var result = new List<Target>();
    int count;
    try { count = Math.Max(0, container.accChildCount); } catch { return result; }
    if (count == 0) return result;
    var raw = new object[count];
    int obtained;
    if (AccessibleChildren(container, 0, count, raw, out obtained) < 0) return result;
    for (int i = 0; i < obtained; i++) {
      var childObject = raw[i] as IAccessible;
      if (childObject != null) {
        result.Add(new Target { accessible = childObject, childId = CHILDID_SELF, childObject = childObject });
        continue;
      }
      if (!(raw[i] is int)) continue;
      object childId = raw[i];
      IAccessible nested = null;
      try { nested = container.get_accChild(childId) as IAccessible; } catch { }
      result.Add(new Target { accessible = container, childId = childId, childObject = nested });
    }
    return result;
  }

  private static T Read<T>(Func<T> read, T fallback) {
    try { return read(); } catch { return fallback; }
  }

  private static string RoleName(object value) {
    try {
      if (value is int) return ((AccessibleRole)(int)value).ToString();
      return Convert.ToString(value) ?? "Custom";
    } catch { return "Custom"; }
  }

  private static AccessibleStates State(IAccessible accessible, object childId) {
    try { return (AccessibleStates)Convert.ToInt32(accessible.get_accState(childId)); }
    catch { return AccessibleStates.None; }
  }

  private static ZuraLegacyNode Node(Target target, string runtimeId, string parentRuntimeId) {
    int x = 0, y = 0, width = 0, height = 0;
    try { target.accessible.accLocation(out x, out y, out width, out height, target.childId); } catch { }
    var state = State(target.accessible, target.childId);
    string defaultAction = Read(() => target.accessible.get_accDefaultAction(target.childId), "");
    return new ZuraLegacyNode {
      runtimeId = runtimeId,
      parentRuntimeId = parentRuntimeId,
      name = Read(() => target.accessible.get_accName(target.childId), "") ?? "",
      value = Read(() => target.accessible.get_accValue(target.childId), "") ?? "",
      controlType = RoleName(Read(() => target.accessible.get_accRole(target.childId), null)),
      className = "MSAA",
      enabled = (state & AccessibleStates.Unavailable) == 0,
      focused = (state & AccessibleStates.Focused) != 0,
      selected = (state & AccessibleStates.Selected) != 0,
      visible = width > 0 && height > 0 && (state & (AccessibleStates.Invisible | AccessibleStates.Offscreen)) == 0,
      bounds = new { x = x, y = y, width = width, height = height },
      supportedPatterns = String.IsNullOrWhiteSpace(defaultAction)
        ? new string[0]
        : new [] { "LegacyDefaultAction" },
      source = "msaa"
    };
  }

  private static void Walk(
    IAccessible container,
    string parentRuntimeId,
    string path,
    int depth,
    int maxDepth,
    int maxElements,
    List<ZuraLegacyNode> output) {
    if (depth > maxDepth || output.Count >= maxElements) return;
    var children = Children(container);
    for (int i = 0; i < children.Count && output.Count < maxElements; i++) {
      string childPath = String.IsNullOrEmpty(path) ? i.ToString() : path + "/" + i;
      string runtimeId = "legacy:" + childPath;
      var target = children[i];
      output.Add(Node(target, runtimeId, parentRuntimeId));
      if (target.childObject != null) {
        Walk(target.childObject, runtimeId, childPath, depth + 1, maxDepth, maxElements, output);
      }
    }
  }

  public static ZuraLegacyNode[] Capture(long hwnd, int maxDepth, int maxElements) {
    var root = Root(hwnd);
    if (root == null) return new ZuraLegacyNode[0];
    var output = new List<ZuraLegacyNode>();
    Walk(root, null, "", 1, Math.Max(1, maxDepth), Math.Max(1, maxElements), output);
    return output.ToArray();
  }

  private static Target Resolve(long hwnd, string path) {
    var current = Root(hwnd);
    if (current == null) return null;
    Target selected = null;
    string[] parts = path.Split('/');
    for (int partIndex = 0; partIndex < parts.Length; partIndex++) {
      string part = parts[partIndex];
      int index;
      if (!Int32.TryParse(part, out index)) return null;
      var children = Children(current);
      if (index < 0 || index >= children.Count) return null;
      selected = children[index];
      if (partIndex < parts.Length - 1) {
        if (selected.childObject == null) return null;
        current = selected.childObject;
      }
    }
    return selected;
  }

  public static void Invoke(long hwnd, string runtimeId, string expectedName, string expectedRole) {
    string path = runtimeId != null && runtimeId.StartsWith("legacy:")
      ? runtimeId.Substring("legacy:".Length)
      : "";
    var target = Resolve(hwnd, path);
    if (target == null) throw new InvalidOperationException("ZURA_UIA_TARGET_LOST: Legacy element is stale.");
    string name = Read(() => target.accessible.get_accName(target.childId), "") ?? "";
    string role = RoleName(Read(() => target.accessible.get_accRole(target.childId), null));
    if (!String.Equals(name, expectedName ?? "", StringComparison.Ordinal) ||
        !String.Equals(role, expectedRole ?? "", StringComparison.Ordinal)) {
      throw new InvalidOperationException("ZURA_UIA_TARGET_CHANGED: Legacy element identity changed.");
    }
    target.accessible.accDoDefaultAction(target.childId);
  }
}
"@
}
`
