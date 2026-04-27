import shutil
import os
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class ExtensionService:
    """Handles packaging and serving of browser extensions."""

    def __init__(self, root_dir: Path, output_dir: Path):
        self.extension_dir = root_dir / "extension"
        self.output_dir = output_dir
        
    def package_extension(self):
        """Packages the extension directory into ZIP, CRX, and XPI formats."""
        try:
            if not self.extension_dir.exists():
                logger.error(f"Extension source directory not found: {self.extension_dir}")
                return False

            self.output_dir.mkdir(parents=True, exist_ok=True)

            # 1. Create ZIP
            zip_base = self.output_dir / "mcq_solver_extension"
            logger.info(f"Packaging extension from {self.extension_dir} to {zip_base}.zip")
            
            # shutil.make_archive adds the .zip extension automatically
            shutil.make_archive(str(zip_base), 'zip', self.extension_dir)
            
            zip_path = self.output_dir / "mcq_solver_extension.zip"
            
            # 2. Create CRX and XPI placeholders (copies of ZIP as per original script)
            shutil.copy2(zip_path, self.output_dir / "mcq_solver_extension.crx")
            shutil.copy2(zip_path, self.output_dir / "mcq_solver_extension.xpi")
            
            # Also copy to a root static folder if needed by legacy links
            static_root_zip = self.output_dir.parent / "extension.zip"
            shutil.copy2(zip_path, static_root_zip)

            logger.info("Extension packaging successful.")
            return True
        except Exception as e:
            logger.error(f"Failed to package extension: {e}")
            return False
