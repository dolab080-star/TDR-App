export function UsbInstructions() {
  return (
    <ol className="usb-steps">
      <li>
        Format a USB stick as <b>exFAT</b> or FAT32 (not NTFS).
      </li>
      <li>
        Unzip and copy the <code>LightShow</code> folder to the root of the stick.
      </li>
      <li>No TeslaCam folder or firmware/map files on the same stick.</li>
      <li>Plug into a front USB / glovebox port, wait a few seconds.</li>
      <li>
        In the car: <b>Toybox → Light Show → Schedule Show</b>.
      </li>
    </ol>
  );
}
