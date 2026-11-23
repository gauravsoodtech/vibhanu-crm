import { describe, expect, it } from "vitest";
import { dial, mixArgs, parseCallState, parseDevices } from "./phone.mjs";

const dump = (call, fg = 0, bg = 0) =>
  `    mCallState=${call}\n    mRingingCallState=0\n    mForegroundCallState=${fg}\n    mBackgroundCallState=${bg}\n    mCallState=0\n    mForegroundCallState=0\n    mBackgroundCallState=0\n`;

describe("phone", () => {
  it("reads the call state", () => {
    expect(parseCallState(dump(0))).toBe("idle");
    expect(parseCallState(dump(1))).toBe("ringing");
    expect(parseCallState(dump(2, 3))).toBe("dialing");
    expect(parseCallState(dump(2, 4))).toBe("dialing");
    expect(parseCallState(dump(2, 1))).toBe("active");
    expect(parseCallState(dump(2, 0, 2))).toBe("active"); // on hold
    expect(parseCallState(dump(2, 0))).toBe("active"); // phone gives no detail: keep the recording
    expect(parseCallState(null)).toBeNull(); // cable dropped
    expect(parseCallState("")).toBeNull();
  });

  it("finds the phone", () => {
    expect(parseDevices("abc12345               device product:CPH2467 model:CPH2467\n")).toEqual({ serial: "abc12345", state: "device" });
    expect(parseDevices("abc12345   unauthorized usb:1-2")).toEqual({ serial: "abc12345", state: "unauthorized" });
    expect(parseDevices("\n")).toBeNull();
    expect(parseDevices(null)).toBeNull();
  });

  it("refuses to dial anything that is not an Indian mobile number", async () => {
    for (const bad of ["", "12345", "9876543210; reboot", "+919876543210", "$(reboot)"]) expect(await dial(bad)).toBe(false);
  });

  it("drops the ringing only from the first part", () => {
    const a = mixArgs(["1.mka", "2.mka"], 4.2, "o.m4a").join(" ");
    expect(a).toContain("-ss 4.20 -i 1.mka -i 2.mka");
    expect(a).toContain("concat=n=2");
    expect(mixArgs(["1.mka"], 0, "o.m4a").join(" ")).not.toContain("-ss");
  });
});
