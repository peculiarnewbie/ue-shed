# Headless Data Authoring host

This is the smallest real, non-Electron composition of the Data Authoring kernel. It uses
`ShedHostLive` and the direct `AuthoringClient` service; it does not import Workbench or any UI.

Configure a project, one saved DataTable package, the native reader, and optionally Remote Control:

```powershell
$env:UE_SHED_PROJECT_ROOT = "C:\path\to\Project"
$env:UE_SHED_AUTHORING_ASSET = "C:\path\to\Project\Content\DT_Test.uasset"
$env:UE_SHED_UASSET_EXECUTABLE = "C:\path\to\uasset.exe"
$env:UE_SHED_REMOTE_CONTROL_ENDPOINT = "http://127.0.0.1:30001"
pnpm --filter @ue-shed/example-authoring-headless start
```

The example loads the saved table and opens or resumes its persistent draft session. It deliberately
does not provide a file picker; an embedding host owns that adapter.
