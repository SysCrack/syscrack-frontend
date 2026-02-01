@echo off
echo Current Branch:
git branch --show-current
echo Staging files...
git add -A
echo Committing...
git commit -v -m "feat: Full system design implementation"
echo Push status...
git push -f origin feature/system-design-canvas
echo Done.
