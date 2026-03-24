import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { ArrowDownToLine, Download } from "lucide-react-native";
import {
  cacheRemoteMedia,
  getSecureCachedUri,
  getSecureMediaCacheVersion,
  subscribeSecureMediaCache,
} from "../lib/secure-media-cache";
import { Colors } from "../theme/colors";

type Props = {
  remoteUri: string;
  blurDataUrl?: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: "cover" | "contain";
  requireManualDownload?: boolean;
  manualDownloadVariant?: "pill" | "icon";
  onPress?: () => void;
};

export function PersistentCachedImage({
  remoteUri,
  blurDataUrl,
  style,
  contentFit = "cover",
  requireManualDownload = false,
  manualDownloadVariant = "pill",
  onPress,
}: Props) {
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cacheVersion, setCacheVersion] = useState(() => getSecureMediaCacheVersion());

  useEffect(() => subscribeSecureMediaCache(setCacheVersion), []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      const cachedUri = await getSecureCachedUri(remoteUri);

      if (cachedUri && active) {
        setResolvedUri(cachedUri);
        setDownloaded(true);
        setLoading(false);
        return;
      }

      if (active) {
        setResolvedUri(requireManualDownload ? null : remoteUri);
        setDownloaded(false);
      }

      if (requireManualDownload) {
        setLoading(false);
        return;
      }

      try {
        const localUri = await cacheRemoteMedia(remoteUri);
        if (localUri && active) {
          setResolvedUri(localUri);
          setDownloaded(true);
        }
      } catch {
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [cacheVersion, remoteUri, requireManualDownload]);

  const handleDownload = async () => {
    if (loading || downloaded) {
      return;
    }

    setLoading(true);

    try {
      const localUri = await cacheRemoteMedia(remoteUri);
      setResolvedUri(localUri || remoteUri);
      setDownloaded(true);
    } catch {
      setResolvedUri(remoteUri);
      setDownloaded(true);
    } finally {
      setLoading(false);
    }
  };

  const showDownloadOverlay = requireManualDownload && !downloaded;
  const previewUri = blurDataUrl || null;

  return (
    <View style={[styles.container, style]}>
      {showDownloadOverlay ? (
        <>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              contentFit={contentFit}
              transition={120}
              style={StyleSheet.absoluteFillObject}
            />
          ) : null}
          <View style={styles.previewShade} />
          <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.downloadOverlay}>
            <Pressable
              style={[
                styles.downloadButton,
                manualDownloadVariant === "icon" && styles.downloadButtonIconOnly,
              ]}
              onPress={handleDownload}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  {manualDownloadVariant === "icon" ? (
                    <ArrowDownToLine size={18} color="#fff" />
                  ) : (
                    <>
                      <Download size={18} color="#fff" />
                      <Text style={styles.downloadText}>Yuklash</Text>
                    </>
                  )}
                </>
              )}
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable disabled={!onPress} onPress={onPress} style={StyleSheet.absoluteFillObject}>
          <Image
            source={{ uri: resolvedUri || remoteUri }}
            placeholder={blurDataUrl ? { uri: blurDataUrl } : undefined}
            contentFit={contentFit}
            transition={180}
            style={StyleSheet.absoluteFillObject}
          />
        </Pressable>
      )}
      {loading && !resolvedUri && !showDownloadOverlay ? (
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: Colors.input,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  previewShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(12, 14, 22, 0.28)",
  },
  downloadOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadButton: {
    minWidth: 110,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "rgba(10, 12, 20, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  downloadButtonIconOnly: {
    minWidth: 0,
    width: 46,
    height: 46,
    paddingHorizontal: 0,
    borderRadius: 16,
    backgroundColor: "rgba(10, 12, 20, 0.8)",
  },
  downloadText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
