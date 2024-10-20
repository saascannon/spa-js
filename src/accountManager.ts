import Modal from "./modal";
import EventEmitter from "./eventEmitter";
import SaascannonSpaSdk from ".";
import { SaascannonAccountManagement } from "@saascannon/account-management-js";

class AccountManagement extends EventEmitter<"account-updated"> {
  private accountSettingsModal: Modal;
  public api: SaascannonAccountManagement;

  constructor(
    uiBaseUrl: string,
    applicationBaseDomain: string,
    sdk: SaascannonSpaSdk,
    tenantDomain: string,
  ) {
    super();

    this.api = new SaascannonAccountManagement({
      BASE: `${tenantDomain}/accounts-api`,
      VERSION: "2.0",
      WITH_CREDENTIALS: false,
      CREDENTIALS: "omit",
      TOKEN: async () => {
        const accessToken = await sdk.getAccessToken();
        if (!accessToken) {
          throw new Error("User not logged in");
        }
        return accessToken;
      },
    });

    const accountSettingsIframeUrl = new URL(
      "/account-management/manage-account",
      uiBaseUrl,
    );
    accountSettingsIframeUrl.searchParams.set("domain", applicationBaseDomain);
    accountSettingsIframeUrl.searchParams.set(
      "parentOrigin",
      window.location.origin,
    );
    const accountSettingsIframe = this.createIFrame(accountSettingsIframeUrl);

    this.accountSettingsModal = new Modal(accountSettingsIframe);

    window.addEventListener("message", async (e: MessageEvent) => {
      if (e.source !== accountSettingsIframe.contentWindow) {
        return;
      }
      if (e.data === "account-updated") {
        this.triggerEvent("account-updated");
        return;
      }

      if (e.data === "reload") {
        console.info("Forcing reload on Saascannon IFrames");
        accountSettingsIframe.src = accountSettingsIframeUrl.toString();
      }

      try {
        const { method, payload, callbackId } = JSON.parse(e.data);

        if (method === "getAccessToken") {
          const accessToken = await sdk.getAccessToken();
          e.source?.postMessage(
            JSON.stringify({
              method: "getAccessToken",
              payload: accessToken,
              callbackId,
            }),
            uiBaseUrl,
          );
        } else if (method === "closeModal") {
          this.accountSettingsModal.close();
          e.source?.postMessage(
            JSON.stringify({
              method: "closeModal",
              callbackId,
            }),
            uiBaseUrl,
          );
        } else if (method === "getUser") {
          e.source?.postMessage(
            JSON.stringify({
              method: "getUser",
              callbackId,
              payload: sdk.user,
            }),
            uiBaseUrl,
          );
        } else if (
          method === "accountManagementApi" &&
          sdk.accountManagement.api.hasOwnProperty(payload.resource) &&
          payload.method in
            sdk.accountManagement.api[
              payload.resource as keyof typeof sdk.accountManagement.api
            ]
        ) {
          const apiResource =
            sdk.accountManagement.api[
              payload.resource as keyof typeof sdk.accountManagement.api
            ];

          // @ts-expect-errork
          const result = await apiResource[
            payload.method as keyof typeof apiResource
          ](...(Array.isArray(payload.args) ? payload.args : []));

          e.source?.postMessage(
            JSON.stringify({
              method: "accountManagementApi",
              callbackId,
              payload: result,
            }),
            uiBaseUrl,
          );
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  private createIFrame(uiPageFullUrl: URL): HTMLIFrameElement {
    const iFrame = document.createElement("iframe");
    iFrame.src = uiPageFullUrl.toString();

    return iFrame;
  }

  public open() {
    this.accountSettingsModal.open();
  }

  public close() {
    this.accountSettingsModal.close();
  }
}

export default AccountManagement;
